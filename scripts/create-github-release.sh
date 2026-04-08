#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPO;
const version = process.env.RELEASE_VERSION;

if (!token || !repo || !version) {
  throw new Error("GITHUB_TOKEN, GITHUB_REPO, and RELEASE_VERSION are required");
}

const notesPath = path.resolve("CHANGELOG.md");
const notes = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, "utf8")
  : `Release ${version}`;

process.stdout.write(
  JSON.stringify(
    {
      tag_name: `v${version}`,
      name: `v${version}`,
      body: notes,
      draft: false,
      prerelease: false
    },
    null,
    2
  ) + "\n"
);
