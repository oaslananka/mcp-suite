import { readFile } from "node:fs/promises";
import path from "node:path";

const targets = [
  "packages/atlas/smithery.yaml",
  "packages/bridge/smithery.yaml",
  "packages/composer/smithery.yaml",
  "packages/forge/smithery.yaml",
  "packages/sentinel/smithery.yaml",
];

const requiredPatterns = [
  /^name:\s+/m,
  /^displayName:\s+/m,
  /^description:\s+/m,
  /^startCommand:\s*/m,
];

for (const relativePath of targets) {
  const filePath = path.resolve(process.cwd(), relativePath);
  const source = await readFile(filePath, "utf8");

  if (!source.includes("@oaslananka/")) {
    throw new Error(`Expected scoped package name in ${relativePath}`);
  }

  for (const pattern of requiredPatterns) {
    if (!pattern.test(source)) {
      throw new Error(`Missing ${pattern} in ${relativePath}`);
    }
  }
}

console.log(`Validated ${targets.length} Smithery metadata file(s).`);
