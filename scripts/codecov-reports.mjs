import { appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ignoredDirectories = new Set([".git", "node_modules", "dist"]);

export async function collectCodecovReports(rootDir) {
  const coverageFiles = [];
  const testResultFiles = [];

  await walk(rootDir, rootDir, coverageFiles, testResultFiles);

  coverageFiles.sort((left, right) => left.localeCompare(right));
  testResultFiles.sort((left, right) => left.localeCompare(right));

  return { coverageFiles, testResultFiles };
}

async function walk(rootDir, currentDir, coverageFiles, testResultFiles) {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await walk(rootDir, absolutePath, coverageFiles, testResultFiles);
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
    const segments = relativePath.split("/");
    if (entry.name === "lcov.info" && segments.includes("coverage")) {
      if (await isPlausibleLcov(absolutePath)) coverageFiles.push(relativePath);
    }
    if (entry.name === "junit.xml" && segments.includes("test-results")) {
      if (await isPlausibleJunit(absolutePath)) testResultFiles.push(relativePath);
    }
  }
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
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const reports = await collectCodecovReports(rootDir);
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
