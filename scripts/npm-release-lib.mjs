import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const NPM_REGISTRY = "https://registry.npmjs.org/";
export const RELEASE_REPOSITORY = "https://github.com/oaslananka/mcp-suite.git";

export function resolveNpmCliPath(execPath = process.execPath) {
  const adjacent = path.resolve(path.dirname(execPath), "../lib/node_modules/npm/bin/npm-cli.js");
  if (existsSync(adjacent)) {
    return adjacent;
  }

  const lifecycleCli = process.env.npm_execpath;
  if (lifecycleCli && existsSync(lifecycleCli)) {
    return lifecycleCli;
  }

  throw new Error(`Unable to locate npm CLI for Node runtime ${execPath}`);
}

export function npmCommand(args, options = {}) {
  return runCommand(process.execPath, [resolveNpmCliPath(), ...args], {
    ...options,
    env: withActiveNodePath(options.env ?? process.env),
  });
}

export async function loadExpectedPackages(root = process.cwd()) {
  const config = await readJson(path.join(root, "release-please-config.json"));
  const manifest = await readJson(path.join(root, ".release-please-manifest.json"));
  const packages = [];

  for (const packagePath of Object.keys(config.packages ?? {})) {
    const packageJson = await readJson(path.join(root, packagePath, "package.json"));
    if (packageJson.private === true || packageJson.publishConfig?.registry !== NPM_REGISTRY) {
      continue;
    }

    packages.push({
      path: packagePath,
      name: packageJson.name,
      version: packageJson.version,
      manifestVersion: manifest[packagePath] ?? null,
      dependencies: packageJson.dependencies ?? {},
      bin: packageJson.bin ?? {},
      main: packageJson.main ?? null,
      module: packageJson.module ?? null,
      types: packageJson.types ?? null,
      repository: packageJson.repository ?? null,
    });
  }

  return sortPackages(packages);
}

export function sortPackages(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const temporary = new Set();
  const permanent = new Set();
  const ordered = [];

  function visit(pkg) {
    if (permanent.has(pkg.name)) {
      return;
    }
    if (temporary.has(pkg.name)) {
      throw new Error(`Circular publish dependency detected at ${pkg.name}`);
    }

    temporary.add(pkg.name);
    for (const dependencyName of Object.keys(pkg.dependencies ?? {}).sort()) {
      const dependency = byName.get(dependencyName);
      if (dependency) {
        visit(dependency);
      }
    }
    temporary.delete(pkg.name);
    permanent.add(pkg.name);
    ordered.push(pkg);
  }

  for (const pkg of [...packages].sort((left, right) => left.name.localeCompare(right.name))) {
    visit(pkg);
  }

  return ordered;
}

export async function verifyNpmArtifacts({
  root = process.cwd(),
  artifactsDir,
  checksumsPath,
  now = () => new Date(),
}) {
  if (!artifactsDir || !checksumsPath) {
    throw new TypeError("artifactsDir and checksumsPath are required");
  }

  const expectedPackages = await loadExpectedPackages(root);
  const checksums = await readChecksums(checksumsPath);
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const tarballs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => path.join(artifactsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const artifactsByName = new Map();

  for (const tarballPath of tarballs) {
    const artifact = await inspectTarball(tarballPath);
    const expectedChecksum = checksums.get(path.basename(tarballPath));
    if (!expectedChecksum) {
      throw new Error(`${path.basename(tarballPath)} is missing from SHA256SUMS.txt`);
    }

    const sha256 = await digestFile(tarballPath, "sha256", "hex");
    if (sha256 !== expectedChecksum) {
      throw new Error(`${path.basename(tarballPath)} failed SHA-256 verification`);
    }

    validateArtifact(artifact, expectedPackages);
    if (artifactsByName.has(artifact.packageJson.name)) {
      throw new Error(`Duplicate artifact for ${artifact.packageJson.name}`);
    }

    artifactsByName.set(artifact.packageJson.name, {
      name: artifact.packageJson.name,
      version: artifact.packageJson.version,
      file: path.basename(tarballPath),
      sha256,
      shasum: await digestFile(tarballPath, "sha1", "hex"),
      integrity: `sha512-${await digestFile(tarballPath, "sha512", "base64")}`,
      bins: Object.keys(artifact.packageJson.bin ?? {}).sort(),
      dependencies: artifact.packageJson.dependencies ?? {},
    });
  }

  const missing = expectedPackages.filter((pkg) => !artifactsByName.has(pkg.name));
  if (missing.length > 0) {
    throw new Error(
      `Missing npm artifacts: ${missing.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`
    );
  }

  const unexpected = [...artifactsByName.keys()].filter(
    (name) => !expectedPackages.some((pkg) => pkg.name === name)
  );
  if (unexpected.length > 0) {
    throw new Error(`Unexpected npm artifacts: ${unexpected.join(", ")}`);
  }

  return {
    schema_version: 1,
    repository: "oaslananka/mcp-suite",
    registry: NPM_REGISTRY,
    generated_at: now().toISOString(),
    packages: expectedPackages.map((pkg) => artifactsByName.get(pkg.name)),
  };
}

export async function inspectTarball(tarballPath) {
  const listResult = spawnSync("tar", ["-tzf", tarballPath], {
    encoding: "utf8",
    windowsHide: true,
  });
  assertCommandSucceeded(listResult, `Unable to list ${path.basename(tarballPath)}`);

  const entries = listResult.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${path.basename(tarballPath)} contains duplicate archive entries`);
  }
  if (entries.length > 10_000) {
    throw new Error(`${path.basename(tarballPath)} contains too many archive entries`);
  }

  const verboseResult = spawnSync("tar", ["-tvzf", tarballPath], {
    encoding: "utf8",
    windowsHide: true,
  });
  assertCommandSucceeded(verboseResult, `Unable to inspect ${path.basename(tarballPath)}`);
  for (const line of verboseResult.stdout.split(/\r?\n/u).filter(Boolean)) {
    const entryType = line[0];
    if (entryType !== "-" && entryType !== "d") {
      throw new Error(`${path.basename(tarballPath)} contains a link or special archive entry`);
    }
  }

  for (const entry of entries) {
    if (!entry.startsWith("package/")) {
      throw new Error(
        `${path.basename(tarballPath)} contains an unexpected archive root: ${entry}`
      );
    }
    const relative = entry.slice("package/".length);
    if (relative && isUnsafeArchivePath(relative)) {
      throw new Error(`${path.basename(tarballPath)} contains an unsafe archive path: ${entry}`);
    }
  }

  const manifestResult = spawnSync("tar", ["-xOzf", tarballPath, "package/package.json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  assertCommandSucceeded(
    manifestResult,
    `Unable to read package.json from ${path.basename(tarballPath)}`
  );

  let packageJson;
  try {
    packageJson = JSON.parse(manifestResult.stdout);
  } catch (error) {
    throw new Error(
      `${path.basename(tarballPath)} contains invalid package.json: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  return {
    tarballPath,
    entries: new Set(entries.map((entry) => entry.slice("package/".length).replace(/\/$/u, ""))),
    packageJson,
  };
}

export async function registryPublicationPlan(releaseManifest, fetchImpl = globalThis.fetch) {
  const plan = [];

  for (const artifact of releaseManifest.packages) {
    const published = await fetchPublishedVersion(artifact.name, artifact.version, fetchImpl);
    if (!published) {
      plan.push({ ...artifact, action: "publish" });
      continue;
    }

    if (!matchesPublishedIntegrity(published, artifact)) {
      throw new Error(
        `${artifact.name}@${artifact.version} already exists with different registry integrity`
      );
    }

    plan.push({ ...artifact, action: "skip" });
  }

  return plan;
}

export async function fetchPublishedVersion(name, version, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${NPM_REGISTRY}${encodeURIComponent(name)}`, {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`npm registry check failed for ${name}: HTTP ${response.status}`);
  }

  const metadata = await response.json();
  return metadata.versions?.[version] ?? null;
}

export async function waitForPublishedIntegrity(
  artifact,
  { fetchImpl = globalThis.fetch, attempts = 12, delayMs = 5_000, sleep = defaultSleep } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const published = await fetchPublishedVersion(artifact.name, artifact.version, fetchImpl);
    if (published && matchesPublishedIntegrity(published, artifact)) {
      return;
    }
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${artifact.name}@${artifact.version} did not become available with the expected integrity`
  );
}

export function runCommand(command, args, options = {}) {
  const { capture = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
    ...spawnOptions,
  });
  assertCommandSucceeded(result, `${command} ${args.join(" ")} failed`);
  return result;
}

function matchesPublishedIntegrity(published, artifact) {
  if (published.dist?.integrity) {
    return published.dist.integrity === artifact.integrity;
  }
  return Boolean(published.dist?.shasum) && published.dist.shasum === artifact.shasum;
}

function validateArtifact(artifact, expectedPackages) {
  const { packageJson, entries, tarballPath } = artifact;
  const expected = expectedPackages.find((pkg) => pkg.name === packageJson.name);
  if (!expected) {
    throw new Error(
      `${path.basename(tarballPath)} declares unexpected package ${packageJson.name}`
    );
  }
  if (
    packageJson.version !== expected.version ||
    packageJson.version !== expected.manifestVersion
  ) {
    throw new Error(
      `${packageJson.name}: artifact version ${packageJson.version} does not match package and release manifest ${expected.version}`
    );
  }
  if (packageJson.publishConfig?.registry !== NPM_REGISTRY) {
    throw new Error(`${packageJson.name}: artifact registry must be ${NPM_REGISTRY}`);
  }
  if (packageJson.publishConfig?.access !== "public") {
    throw new Error(`${packageJson.name}: artifact publish access must be public`);
  }
  if (repositoryUrl(packageJson.repository) !== RELEASE_REPOSITORY) {
    throw new Error(`${packageJson.name}: repository.url must match ${RELEASE_REPOSITORY}`);
  }
  if (![...entries].some((entry) => entry.startsWith("dist/"))) {
    throw new Error(`${packageJson.name}: artifact does not contain built dist files`);
  }

  for (const [dependencyName, dependencyVersion] of Object.entries(
    packageJson.dependencies ?? {}
  )) {
    if (String(dependencyVersion).startsWith("workspace:")) {
      throw new Error(`${packageJson.name}: unresolved workspace dependency ${dependencyName}`);
    }
    const internal = expectedPackages.find((pkg) => pkg.name === dependencyName);
    if (internal && dependencyVersion !== internal.version) {
      throw new Error(
        `${packageJson.name}: internal dependency ${dependencyName} must resolve to ${internal.version}`
      );
    }
  }

  const entrypoints = [
    packageJson.main,
    packageJson.module,
    packageJson.types,
    ...Object.values(packageJson.bin ?? {}),
    ...exportTargets(packageJson.exports),
  ].filter((entry) => typeof entry === "string");

  for (const entrypoint of new Set(entrypoints)) {
    const normalized = normalizePackagePath(entrypoint);
    if (!entries.has(normalized)) {
      throw new Error(
        `${packageJson.name}: declared entrypoint ${entrypoint} is missing from artifact`
      );
    }
  }

  for (const binTarget of Object.values(packageJson.bin ?? {})) {
    const normalized = normalizePackagePath(binTarget);
    const firstLine = readTarballFile(tarballPath, `package/${normalized}`).split(/\r?\n/u, 1)[0];
    if (firstLine !== "#!/usr/bin/env node") {
      throw new Error(`${packageJson.name}: CLI ${normalized} is missing the Node.js shebang`);
    }
  }
}

function exportTargets(exportsField) {
  if (!exportsField || typeof exportsField !== "object") {
    return [];
  }
  const targets = [];
  const stack = [exportsField];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === "string") {
      targets.push(value);
    } else if (value && typeof value === "object") {
      stack.push(...Object.values(value));
    }
  }
  return targets;
}

function normalizePackagePath(value) {
  const normalized = value.replace(/^\.\//u, "").replaceAll("\\", "/");
  if (isUnsafeArchivePath(normalized)) {
    throw new Error(`Unsafe package entrypoint: ${value}`);
  }
  return normalized;
}

function isUnsafeArchivePath(value) {
  if (!value || value.startsWith("/") || value.includes("\\")) {
    return true;
  }
  const segments = value.split("/");
  return segments.includes("..") || path.posix.isAbsolute(value);
}

function repositoryUrl(repository) {
  return typeof repository === "string" ? repository : repository?.url;
}

function readTarballFile(tarballPath, entry) {
  const result = spawnSync("tar", ["-xOzf", tarballPath, entry], {
    encoding: "utf8",
    windowsHide: true,
  });
  assertCommandSucceeded(result, `Unable to read ${entry} from ${path.basename(tarballPath)}`);
  return result.stdout;
}

async function readChecksums(checksumsPath) {
  const content = await readFile(checksumsPath, "utf8");
  const checksums = new Map();
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/u.exec(line.trim());
    if (!match) {
      continue;
    }
    const filename = path.basename(match[2]);
    if (checksums.has(filename)) {
      throw new Error(`Duplicate checksum entry for ${filename}`);
    }
    checksums.set(filename, match[1]);
  }
  return checksums;
}

async function digestFile(file, algorithm, encoding) {
  const bytes = await readFile(file);
  return createHash(algorithm).update(bytes).digest(encoding);
}

function assertCommandSucceeded(result, message) {
  if (result.error) {
    throw new Error(`${message}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `${message}: ${details}` : message);
  }
}

function withActiveNodePath(env) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const nodeBin = path.dirname(process.execPath);
  const currentPath = env.PATH ?? env.Path ?? "";
  return {
    ...env,
    PATH: [nodeBin, currentPath].filter(Boolean).join(delimiter),
  };
}

function defaultSleep(delayMs) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
