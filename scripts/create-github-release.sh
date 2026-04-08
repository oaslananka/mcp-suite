#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPO;
const version = process.env.RELEASE_VERSION;

if (!token || !repo || !version) {
  throw new Error("GITHUB_TOKEN, GITHUB_REPO, and RELEASE_VERSION are required");
}

const tagName = `v${version}`;
const apiBase = `https://api.github.com/repos/${repo}`;
const uploadBase = "https://uploads.github.com";

function isNotFound(response) {
  return response.status === 404;
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "mcp-suite-release-bot",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function extractReleaseNotes() {
  const changelogPath = path.resolve("CHANGELOG.md");
  if (!fs.existsSync(changelogPath)) {
    return `Release ${version}`;
  }

  const changelog = fs.readFileSync(changelogPath, "utf8");
  const marker = `## ${version}`;
  const start = changelog.indexOf(marker);
  if (start === -1) {
    return changelog.trim();
  }

  const next = changelog.indexOf("\n## ", start + marker.length);
  const section = next === -1 ? changelog.slice(start) : changelog.slice(start, next);
  return section.trim();
}

function collectAssetFiles() {
  const roots = [
    path.resolve(process.env.PIPELINE_WORKSPACE ?? "", "lab-linux"),
    path.resolve(process.env.PIPELINE_WORKSPACE ?? "", "lab-windows"),
    path.resolve(process.env.PIPELINE_WORKSPACE ?? "", "lab-macos"),
    path.resolve("lab-linux"),
    path.resolve("lab-windows"),
    path.resolve("lab-macos")
  ];

  const files = [];
  const seen = new Set();

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (seen.has(entry.name)) {
        continue;
      }
      seen.add(entry.name);
      files.push(fullPath);
    }
  }

  for (const root of roots) {
    if (fs.existsSync(root)) {
      walk(root);
    }
  }

  return files;
}

async function getRelease() {
  const response = await fetch(`${apiBase}/releases/tags/${tagName}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "mcp-suite-release-bot"
    }
  });

  if (isNotFound(response)) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function createOrUpdateRelease() {
  const releaseBody = {
    tag_name: tagName,
    target_commitish: process.env.RELEASE_TARGET ?? "main",
    name: tagName,
    body: extractReleaseNotes(),
    draft: false,
    prerelease: version.includes("-")
  };

  const existingRelease = await getRelease();
  if (existingRelease) {
    return githubRequest(`${apiBase}/releases/${existingRelease.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: releaseBody.name,
        body: releaseBody.body,
        draft: releaseBody.draft,
        prerelease: releaseBody.prerelease
      })
    });
  }

  return githubRequest(`${apiBase}/releases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(releaseBody)
  });
}

async function uploadAssets(release) {
  const assetFiles = collectAssetFiles();
  if (assetFiles.length === 0) {
    return;
  }

  const existingAssets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));

  for (const assetFile of assetFiles) {
    const name = path.basename(assetFile);
    if (existingAssets.has(name)) {
      continue;
    }

    const uploadUrl = new URL(`${uploadBase}/repos/${repo}/releases/${release.id}/assets`);
    uploadUrl.searchParams.set("name", name);

    const buffer = fs.readFileSync(assetFile);
    await githubRequest(uploadUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length)
      },
      body: buffer
    });
  }
}

(async () => {
  const release = await createOrUpdateRelease();
  await uploadAssets(release);
  process.stdout.write(`GitHub release ${tagName} is up to date.\n`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
