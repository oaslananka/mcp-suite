import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const forbidden = [
  ["RELEASE", "VERSION"],
  ["INPUT", "VERSION"],
  ["TAG", "NAME"],
  ["release", "version"],
  ["github.event.inputs", "version"],
  ["github.event.inputs", "tag"],
].map((parts) => parts.join(parts[0].includes(".") ? "." : "_"));

const config = await readJson("release-please-config.json");
const manifest = await readJson(".release-please-manifest.json");
const packages = config.packages && typeof config.packages === "object" ? config.packages : {};
const errors = [];

for (const [packagePath, releaseConfig] of Object.entries(packages)) {
  const packageJson = await readJson(path.join(packagePath, "package.json"));
  if (releaseConfig["package-name"] !== packageJson.name) {
    errors.push(`${packagePath}: release-please package-name does not match package.json name`);
  }
  if (manifest[packagePath] !== packageJson.version) {
    errors.push(`${packagePath}: release manifest version ${manifest[packagePath] ?? "(missing)"} does not match package.json ${packageJson.version}`);
  }
  if (packageJson.private === true) {
    errors.push(`${packagePath}: private packages must not be release-managed as npm packages`);
  }
}

for (const packagePath of Object.keys(manifest)) {
  if (!packages[packagePath]) {
    errors.push(`${packagePath}: manifest entry has no release-please package config`);
  }
}

for await (const file of walk(path.join(root, ".github", "workflows"))) {
  const content = await readFile(file, "utf8");
  for (const token of forbidden) {
    if (content.includes(token)) {
      errors.push(`${path.relative(root, file)}: forbidden manual release input token ${token}`);
    }
  }
  if (content.includes(["ubuntu", "latest"].join("-"))) {
    errors.push(`${path.relative(root, file)}: workflows must pin a concrete runner image`);
  }
  if (/uses:\s+[^@\s]+@[A-Za-z0-9_.-]+/u.test(content) && !/uses:\s+[^@\s]+@[a-f0-9]{40}/u.test(content)) {
    errors.push(`${path.relative(root, file)}: action references must be pinned to full commit SHAs`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: "failed", errors }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write("Release preflight completed without release metadata drift or manual version inputs.\n");

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(root, file), "utf8"));
}

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      yield fullPath;
    }
  }
}
