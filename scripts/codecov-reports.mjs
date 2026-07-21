import { appendFile, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ignoredDirectories = new Set([".git", "node_modules", "dist"]);

export async function collectCodecovReports(rootDir) {
  const canonicalRoot = await realpath(rootDir);
  const reports = { coverageFiles: [], testResultFiles: [] };

  await walk(canonicalRoot, canonicalRoot, reports);
  reports.coverageFiles.sort((left, right) => left.localeCompare(right));
  reports.testResultFiles.sort((left, right) => left.localeCompare(right));

  return reports;
}

async function walk(rootDir, currentDir, reports) {
  assertPathWithinRoot(rootDir, currentDir);
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    await processEntry(rootDir, currentDir, entry, reports);
  }
}

async function processEntry(rootDir, currentDir, entry, reports) {
  if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return;

  const absolutePath = path.join(currentDir, entry.name);
  assertPathWithinRoot(rootDir, absolutePath);
  if (entry.isDirectory()) {
    await walk(rootDir, absolutePath, reports);
    return;
  }
  if (!entry.isFile()) return;

  const relativePath = toRepositoryPath(rootDir, absolutePath);
  const segments = new Set(relativePath.split("/"));
  if (entry.name === "lcov.info" && segments.has("coverage")) {
    if (await isPlausibleLcov(absolutePath)) reports.coverageFiles.push(relativePath);
    return;
  }
  if (entry.name === "junit.xml" && segments.has("test-results")) {
    if (await isPlausibleJunit(absolutePath)) reports.testResultFiles.push(relativePath);
  }
}

function assertPathWithinRoot(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Codecov report discovery path escaped the repository root");
  }
}

function toRepositoryPath(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

async function isPlausibleLcov(filePath) {
  const content = await readFile(filePath, "utf8");
  return /^SF:.+/m.test(content) && /^end_of_record$/m.test(content);
}

async function isPlausibleJunit(filePath) {
  const content = (await readFile(filePath, "utf8")).trim();
  return content.startsWith("<") && /<testsuites?\b/.test(content);
}

async function main() {
  const reports = await collectCodecovReports(process.cwd());
  const outputPath = process.env.GITHUB_OUTPUT;

  if (outputPath) {
    await appendFile(
      outputPath,
      `coverage_files=${reports.coverageFiles.join(",")}\n` +
        `test_result_files=${reports.testResultFiles.join(",")}\n`,
      "utf8"
    );
  }

  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
