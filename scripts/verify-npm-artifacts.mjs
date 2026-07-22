import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyNpmArtifacts } from "./npm-release-lib.mjs";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const releaseManifest = await verifyNpmArtifacts({
  artifactsDir: path.resolve(options.artifactsDir),
  checksumsPath: path.resolve(options.checksumsPath),
});
const outputPath = path.resolve(options.outputPath);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");

process.stdout.write(
  `Verified ${releaseManifest.packages.length} npm artifacts and wrote ${path.relative(process.cwd(), outputPath)}.\n`
);

function parseArgs(args) {
  const options = {
    artifactsDir: "artifacts/npm",
    checksumsPath: "artifacts/SHA256SUMS.txt",
    outputPath: "artifacts/npm-release-manifest.json",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--artifacts-dir" && value) {
      options.artifactsDir = value;
      index += 1;
    } else if (arg === "--checksums" && value) {
      options.checksumsPath = value;
      index += 1;
    } else if (arg === "--output" && value) {
      options.outputPath = value;
      index += 1;
    } else {
      throw new TypeError(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}
