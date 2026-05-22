import { mkdir, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] ?? "artifacts/npm");
await mkdir(outputDir, { recursive: true });

const packagesDir = path.resolve("packages");
const entries = await readdir(packagesDir, { withFileTypes: true });
const packed = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = path.join(packagesDir, entry.name);
  const packageJson = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  if (packageJson.private === true || packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
    continue;
  }

  const result = spawnSync("pnpm", ["pack", "--pack-destination", outputDir], {
    cwd: packageDir,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  packed.push(packageJson.name);
}

process.stdout.write(`Packed npm artifacts for ${packed.join(", ")}.\n`);
