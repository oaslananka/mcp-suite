import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { npmCommand, runCommand } from "./npm-release-lib.mjs";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const releaseManifest = JSON.parse(await readFile(path.resolve(options.manifestPath), "utf8"));
if (!Array.isArray(releaseManifest.packages) || releaseManifest.packages.length === 0) {
  throw new Error("npm release manifest contains no packages");
}

const smokeDir = await mkdtemp(path.join(tmpdir(), "mcp-suite-npm-smoke-"));
try {
  const dependencies = Object.fromEntries(
    releaseManifest.packages.map((artifact) => [
      artifact.name,
      options.source === "registry"
        ? artifact.version
        : `file:${path.resolve(options.artifactsDir, artifact.file)}`,
    ])
  );
  await writeFile(
    path.join(smokeDir, "package.json"),
    `${JSON.stringify({ name: "mcp-suite-npm-smoke", private: true, version: "0.0.0", dependencies }, null, 2)}\n`,
    "utf8"
  );

  npmCommand(
    [
      "install",
      "--package-lock=true",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts=false",
      "--registry",
      "https://registry.npmjs.org/",
    ],
    { cwd: smokeDir, env: cleanInstallEnvironment() }
  );

  runCommand(
    process.execPath,
    ["--input-type=module", "--eval", "await import('@oaslananka/shared')"],
    { cwd: smokeDir }
  );
  runCommand(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "const { default: Database } = await import('better-sqlite3'); const db = new Database(':memory:'); const row = db.prepare('select 1 as ok').get(); db.close(); if (row.ok !== 1) process.exit(1);",
    ],
    { cwd: smokeDir }
  );

  for (const artifact of releaseManifest.packages) {
    for (const bin of artifact.bins ?? []) {
      const executable = path.join(smokeDir, "node_modules", ".bin", bin);
      runCommand(executable, ["--help"], {
        cwd: smokeDir,
        env: { ...process.env, NO_COLOR: "1" },
      });
    }
  }

  if (options.source === "registry") {
    npmCommand(["audit", "signatures"], { cwd: smokeDir });
  }

  process.stdout.write(
    `Clean ${options.source} installation and CLI smoke passed for ${releaseManifest.packages.length} packages.\n`
  );
} finally {
  if (options.keep) {
    process.stdout.write(`Smoke directory retained at ${smokeDir}.\n`);
  } else {
    await rm(smokeDir, { recursive: true, force: true });
  }
}

function cleanInstallEnvironment() {
  const env = { ...process.env };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  delete env.NPM_BOOTSTRAP_TOKEN;
  return env;
}

function parseArgs(args) {
  const options = {
    artifactsDir: "artifacts/npm",
    keep: false,
    manifestPath: "artifacts/npm-release-manifest.json",
    source: "registry",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--source" && value) {
      options.source = value;
      index += 1;
    } else if (arg === "--artifacts-dir" && value) {
      options.artifactsDir = value;
      index += 1;
    } else if (arg === "--manifest" && value) {
      options.manifestPath = value;
      index += 1;
    } else if (arg === "--keep") {
      options.keep = true;
    } else {
      throw new TypeError(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (options.source !== "registry" && options.source !== "tarballs") {
    throw new TypeError(`Unsupported smoke source: ${options.source}`);
  }

  return options;
}
