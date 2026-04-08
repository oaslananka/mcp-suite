import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function inferModeFromBranch(branch) {
  if (branch.startsWith("refs/tags/registry-v")) {
    return {
      mode: "metadata-only",
      version: branch.slice("refs/tags/registry-v".length),
    };
  }

  if (branch.startsWith("refs/tags/v")) {
    return {
      mode: "package-release",
      version: branch.slice("refs/tags/v".length),
    };
  }

  return {
    mode: "package-release",
    version: "",
  };
}

function getBaseVersion(version) {
  const match = /^(\d+\.\d+\.\d+)/.exec(version);
  return match?.[1];
}

const inferred = inferModeFromBranch(process.env.BUILD_SOURCEBRANCH ?? "");
const mode = process.env.MCP_REGISTRY_MODE ?? inferred.mode;
const requestedVersion = process.env.MCP_REGISTRY_VERSION ?? inferred.version;
const outputDir = path.resolve(process.env.MCP_REGISTRY_OUTPUT_DIR ?? ".mcp-registry-release");
const targetFilters = (process.env.MCP_REGISTRY_TARGETS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (mode !== "package-release" && mode !== "metadata-only") {
  throw new Error(`Unsupported MCP_REGISTRY_MODE: ${mode}`);
}

if (mode === "metadata-only" && requestedVersion.length === 0) {
  throw new Error("MCP_REGISTRY_VERSION must be set for metadata-only publications.");
}

const packagesDir = path.resolve("packages");
const packageDirs = await readdir(packagesDir, { withFileTypes: true });
const preparedFiles = [];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of packageDirs) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageRoot = path.join(packagesDir, entry.name);
  const packageJsonPath = path.join(packageRoot, "package.json");
  const serverJsonPath = path.join(packageRoot, "server.json");

  try {
    const [packageJsonRaw, serverJsonRaw] = await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(serverJsonPath, "utf8"),
    ]);

    const packageJson = JSON.parse(packageJsonRaw);
    const serverJson = JSON.parse(serverJsonRaw);
    const matchesFilter = targetFilters.length === 0
      || targetFilters.includes(entry.name)
      || targetFilters.includes(packageJson.name)
      || targetFilters.includes(serverJson.name);

    if (!matchesFilter) {
      continue;
    }

    const serverVersion = mode === "metadata-only" ? requestedVersion : packageJson.version;
    const packageVersion = packageJson.version;

    if (packageJson.mcpName !== serverJson.name) {
      throw new Error(`${entry.name}: package.json mcpName must match server.json name.`);
    }

    if (mode === "metadata-only") {
      const prereleaseBase = getBaseVersion(serverVersion);
      if (!prereleaseBase) {
        throw new Error(`${entry.name}: metadata-only registry version must start with a semantic base version.`);
      }

      if (prereleaseBase !== packageVersion) {
        throw new Error(`${entry.name}: metadata-only registry version ${serverVersion} must share base version ${packageVersion}.`);
      }

      if (serverVersion === packageVersion) {
        throw new Error(`${entry.name}: metadata-only registry publication must use a unique prerelease version.`);
      }
    }

    const prepared = {
      ...serverJson,
      version: serverVersion,
      packages: Array.isArray(serverJson.packages)
        ? serverJson.packages.map((pkg) => (
          pkg.registryType === "npm" && pkg.identifier === packageJson.name
            ? { ...pkg, version: packageVersion }
            : pkg
        ))
        : serverJson.packages,
    };

    const packageOutputDir = path.join(outputDir, entry.name);
    const packageOutputFile = path.join(packageOutputDir, "server.json");
    await mkdir(packageOutputDir, { recursive: true });
    await writeFile(packageOutputFile, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");

    preparedFiles.push({
      package: packageJson.name,
      server: serverJson.name,
      file: packageOutputFile,
      version: prepared.version,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }

    throw error;
  }
}

if (preparedFiles.length === 0) {
  throw new Error("No server.json files matched the current MCP Registry publication settings.");
}

const manifest = {
  mode,
  registryVersion: mode === "metadata-only" ? requestedVersion : null,
  generatedAt: new Date().toISOString(),
  files: preparedFiles,
};

await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Prepared ${preparedFiles.length} MCP Registry publication file(s) in ${outputDir}.`);
