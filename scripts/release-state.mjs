import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const config = await readJson("release-please-config.json");
const manifest = await readJson(".release-please-manifest.json");
const packageEntries = Object.keys(config.packages ?? {});
const packages = [];

for (const packagePath of packageEntries) {
  const packageJson = await readJson(path.join(packagePath, "package.json"));
  packages.push({
    path: packagePath,
    name: packageJson.name,
    version: packageJson.version,
    manifestVersion: manifest[packagePath] ?? null,
    publishable:
      packageJson.private !== true &&
      packageJson.publishConfig?.registry === "https://registry.npmjs.org/",
  });
}

const npm = [];
for (const pkg of packages.filter((entry) => entry.publishable)) {
  npm.push(await inspectNpm(pkg));
}

const drift = packages.filter((pkg) => pkg.version !== pkg.manifestVersion);
const existingVersions = npm.filter((entry) => entry.versionExists);
const incompleteRegistryChecks = npm.filter((entry) => entry.error);
const safeToPublish = drift.length === 0 && incompleteRegistryChecks.length === 0;
const state = resolveState({
  blocked: !safeToPublish,
  dryRun: args.has("--dry-run"),
  existingCount: existingVersions.length,
  packageCount: npm.length,
});

const result = {
  repository: "mcp-suite",
  state,
  safe_to_publish: safeToPublish,
  package_versions: packages,
  npm_registry: npm,
  already_published: existingVersions.map((pkg) => `${pkg.name}@${pkg.version}`),
  pending_publication: npm
    .filter((entry) => !entry.versionExists)
    .map((pkg) => `${pkg.name}@${pkg.version}`),
  blockers: [
    ...drift.map(
      (pkg) =>
        `${pkg.name}: package.json ${pkg.version} does not match release manifest ${pkg.manifestVersion}`
    ),
    ...incompleteRegistryChecks.map(
      (pkg) => `${pkg.name}: npm registry check failed: ${pkg.error}`
    ),
  ],
  surfaces: {
    npm: packages.some((pkg) => pkg.publishable),
    pypi: false,
    mcp_registry: true,
    docker: true,
    vscode_marketplace: false,
    open_vsx: false,
    cloudflare: false,
  },
};

const output = JSON.stringify(result, null, 2);
if (args.has("--json")) {
  process.stdout.write(`${output}\n`);
} else {
  process.stdout.write(`${output}\n`);
}

if (drift.length > 0 || incompleteRegistryChecks.length > 0) {
  process.exit(1);
}

function resolveState({ blocked, dryRun, existingCount, packageCount }) {
  if (blocked) {
    return "blocked";
  }
  if (packageCount > 0 && existingCount === packageCount) {
    return "published";
  }
  if (existingCount > 0) {
    return "partial-publication";
  }
  return dryRun ? "dry-run-success" : "ready";
}

async function inspectNpm(pkg) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`;
  try {
    const response = await globalThis.fetch(url, { headers: { accept: "application/json" } });
    if (response.status === 404) {
      return { name: pkg.name, version: pkg.version, versionExists: false };
    }
    if (!response.ok) {
      return {
        name: pkg.name,
        version: pkg.version,
        versionExists: false,
        error: `HTTP ${response.status}`,
      };
    }
    const metadata = await response.json();
    return {
      name: pkg.name,
      version: pkg.version,
      versionExists: Boolean(metadata.versions?.[pkg.version]),
      latest: metadata["dist-tags"]?.latest ?? null,
    };
  } catch (error) {
    return {
      name: pkg.name,
      version: pkg.version,
      versionExists: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(root, file), "utf8"));
}
