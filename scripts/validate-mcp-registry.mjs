import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packagesDir = path.resolve("packages");
const packageDirs = await readdir(packagesDir, { withFileTypes: true });
const failures = [];
let validated = 0;

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
    const npmPackage = Array.isArray(serverJson.packages)
      ? serverJson.packages.find((pkg) => pkg.registryType === "npm")
      : undefined;

    if (!npmPackage) {
      failures.push(`${entry.name}: server.json does not contain an npm package definition.`);
      continue;
    }

    if (packageJson.mcpName !== serverJson.name) {
      failures.push(`${entry.name}: package.json mcpName (${packageJson.mcpName ?? "missing"}) does not match server.json name (${serverJson.name}).`);
    }

    if (packageJson.name !== npmPackage.identifier) {
      failures.push(`${entry.name}: package.json name (${packageJson.name}) does not match server.json identifier (${npmPackage.identifier}).`);
    }

    if (packageJson.version !== serverJson.version) {
      failures.push(`${entry.name}: package.json version (${packageJson.version}) does not match server.json version (${serverJson.version}).`);
    }

    if (packageJson.version !== npmPackage.version) {
      failures.push(`${entry.name}: package.json version (${packageJson.version}) does not match server.json package version (${npmPackage.version}).`);
    }

    validated += 1;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }

    failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (validated === 0) {
  throw new Error("No server.json files were found under packages/.");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }

  process.exit(1);
}

console.log(`Validated ${validated} MCP Registry metadata file(s).`);
