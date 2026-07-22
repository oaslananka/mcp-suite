import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  npmCommand,
  registryPublicationPlan,
  waitForPublishedIntegrity,
} from "./npm-release-lib.mjs";

const options = parseArgs(process.argv.slice(2));
const releaseManifest = JSON.parse(await readFile(path.resolve(options.manifestPath), "utf8"));
validateReleaseManifest(releaseManifest);
validateAuthentication(options.authMode);

const plan = await registryPublicationPlan(releaseManifest);
const conflicts = plan.filter((entry) => entry.action !== "publish" && entry.action !== "skip");
if (conflicts.length > 0) {
  throw new Error(
    `Unsupported publication actions: ${conflicts.map((entry) => entry.action).join(", ")}`
  );
}

for (const artifact of plan) {
  const spec = `${artifact.name}@${artifact.version}`;
  if (artifact.action === "skip") {
    process.stdout.write(`Skipping ${spec}; the matching immutable version already exists.\n`);
    continue;
  }

  const tarballPath = path.resolve(options.artifactsDir, artifact.file);
  const publishArgs = ["publish", tarballPath, "--access", "public"];
  const env = { ...process.env };
  if (options.authMode === "bootstrap") {
    env.NODE_AUTH_TOKEN = process.env.NPM_BOOTSTRAP_TOKEN;
    publishArgs.push("--provenance");
  } else {
    delete env.NODE_AUTH_TOKEN;
    delete env.NPM_TOKEN;
    delete env.NPM_BOOTSTRAP_TOKEN;
  }

  process.stdout.write(`Publishing ${spec} with ${options.authMode} authentication.\n`);
  npmCommand(publishArgs, { env });
  await waitForPublishedIntegrity(artifact);
  process.stdout.write(`Verified ${spec} in the npm registry.\n`);
}

process.stdout.write(
  `npm publication completed for ${releaseManifest.packages.length} packages; reruns are integrity-checked and idempotent.\n`
);

function validateAuthentication(authMode) {
  if (authMode === "oidc") {
    if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
      throw new Error("OIDC publication refuses long-lived npm token environment variables");
    }
    return;
  }

  if (authMode === "bootstrap") {
    if (!process.env.NPM_BOOTSTRAP_TOKEN) {
      throw new Error("Bootstrap publication requires the NPM_BOOTSTRAP_TOKEN environment secret");
    }
    return;
  }

  throw new TypeError(`Unsupported npm authentication mode: ${authMode}`);
}

function validateReleaseManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest?.repository !== "oaslananka/mcp-suite") {
    throw new Error("Invalid npm release manifest");
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error("npm release manifest contains no packages");
  }
}

function parseArgs(args) {
  const options = {
    authMode: "oidc",
    artifactsDir: "artifacts/npm",
    manifestPath: "artifacts/npm-release-manifest.json",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--auth" && value) {
      options.authMode = value;
      index += 1;
    } else if (arg === "--artifacts-dir" && value) {
      options.artifactsDir = value;
      index += 1;
    } else if (arg === "--manifest" && value) {
      options.manifestPath = value;
      index += 1;
    } else {
      throw new TypeError(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}
