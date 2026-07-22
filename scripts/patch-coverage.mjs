import { execFile as execFileCallback } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { collectCodecovReports } from "./codecov-reports.mjs";

const execFile = promisify(execFileCallback);
const SYSTEM_GIT =
  process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "/usr/bin/git";
const ZERO_SHA = /^0+$/u;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/u;
const TEST_FILE = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/u;

export function parseUnifiedDiff(diffText) {
  const changed = new Map();
  let currentFile;
  let currentNewLine;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      currentFile = parseDiffPath(line.slice(4));
      currentNewLine = undefined;
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (hunk) {
      currentNewLine = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (!currentFile || currentNewLine === undefined) continue;
    if (line.startsWith("+")) {
      const fileLines = changed.get(currentFile) ?? new Map();
      fileLines.set(currentNewLine, line.slice(1));
      changed.set(currentFile, fileLines);
      currentNewLine += 1;
      continue;
    }
    if (line.startsWith("-")) continue;
    if (line.startsWith("\\ No newline at end of file")) continue;
    currentNewLine += 1;
  }

  return changed;
}

export async function loadLcovCoverage(rootDir, reportPaths) {
  const coverage = new Map();
  const canonicalRoot = await realpath(rootDir);

  for (const reportPath of reportPaths) {
    const normalizedReport = normalizeRepositoryPath(reportPath);
    const reportRoot = workspaceRootForReport(normalizedReport);
    const report = await readFile(path.join(canonicalRoot, normalizedReport), "utf8");
    let currentFile;

    for (const line of report.split("\n")) {
      if (line.startsWith("SF:")) {
        currentFile = normalizeSourcePath(canonicalRoot, reportRoot, line.slice(3));
        if (!coverage.has(currentFile)) coverage.set(currentFile, new Map());
        continue;
      }

      if (!currentFile || !line.startsWith("DA:")) continue;
      const match = /^DA:(\d+),(\d+(?:\.\d+)?)/u.exec(line);
      if (!match) continue;
      const lineNumber = Number.parseInt(match[1], 10);
      const hits = Number.parseFloat(match[2]);
      const fileCoverage = coverage.get(currentFile);
      fileCoverage.set(lineNumber, Math.max(fileCoverage.get(lineNumber) ?? 0, hits));
    }
  }

  return coverage;
}

export function evaluatePatchCoverage(changed, coverage, target = 80) {
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    throw new Error(`Patch coverage target must be between 0 and 100, received ${target}`);
  }

  const files = [];
  let covered = 0;
  let total = 0;

  for (const [file, changedLines] of [...changed.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const fileCoverage = coverage.get(file);
    let fileCovered = 0;
    let fileTotal = 0;

    if (fileCoverage) {
      for (const lineNumber of changedLines.keys()) {
        if (!fileCoverage.has(lineNumber)) continue;
        fileTotal += 1;
        if ((fileCoverage.get(lineNumber) ?? 0) > 0) fileCovered += 1;
      }
    } else if (isEnforcedSourceFile(file)) {
      for (const sourceLine of changedLines.values()) {
        if (!isCoverableFallbackLine(sourceLine)) continue;
        fileTotal += 1;
      }
    }

    if (fileTotal === 0) continue;
    files.push({
      file,
      covered: fileCovered,
      total: fileTotal,
      coverage: percentage(fileCovered, fileTotal),
    });
    covered += fileCovered;
    total += fileTotal;
  }

  const actual = total === 0 ? 100 : percentage(covered, total);
  return {
    target,
    covered,
    total,
    coverage: actual,
    passed: actual >= target,
    files,
  };
}

export async function checkPatchCoverage({ rootDir, base, target = 80 } = {}) {
  const canonicalRoot = await realpath(rootDir ?? process.cwd());
  const resolvedBase = await resolveBaseCommit(canonicalRoot, base);
  const reports = await collectCodecovReports(canonicalRoot);
  if (reports.coverageFiles.length === 0) {
    throw new Error("No LCOV reports were found for patch coverage evaluation");
  }

  const { stdout: diff } = await execFile(
    SYSTEM_GIT,
    ["diff", "--unified=0", "--no-ext-diff", "--diff-filter=ACMR", `${resolvedBase}...HEAD`, "--"],
    { cwd: canonicalRoot, maxBuffer: 32 * 1024 * 1024 }
  );
  const changed = parseUnifiedDiff(diff);
  const coverage = await loadLcovCoverage(canonicalRoot, reports.coverageFiles);
  return {
    base: resolvedBase,
    reportCount: reports.coverageFiles.length,
    ...evaluatePatchCoverage(changed, coverage, target),
  };
}

function parseDiffPath(rawPath) {
  if (rawPath === "/dev/null") return undefined;
  const unquoted = rawPath.startsWith('"') ? JSON.parse(rawPath) : rawPath;
  return normalizeRepositoryPath(unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted);
}

function normalizeSourcePath(rootDir, reportRoot, sourcePath) {
  const normalizedInput = sourcePath.replaceAll("\\", "/");
  let repositoryPath;
  if (path.isAbsolute(sourcePath)) {
    repositoryPath = path.relative(rootDir, sourcePath).replaceAll(path.sep, "/");
  } else if (
    normalizedInput.startsWith("packages/") ||
    normalizedInput.startsWith("apps/") ||
    normalizedInput.startsWith("scripts/")
  ) {
    repositoryPath = normalizedInput;
  } else {
    repositoryPath = reportRoot ? `${reportRoot}/${normalizedInput}` : normalizedInput;
  }
  return normalizeRepositoryPath(repositoryPath);
}

function normalizeRepositoryPath(candidate) {
  const normalized = path.posix.normalize(candidate.replaceAll("\\", "/").replace(/^\.\//u, ""));
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Coverage path escaped the repository root: ${candidate}`);
  }
  return normalized;
}

function workspaceRootForReport(reportPath) {
  const match = /^(packages\/[^/]+|apps\/[^/]+)\/coverage(?:\/|$)/u.exec(reportPath);
  return match?.[1] ?? "";
}

function isEnforcedSourceFile(file) {
  if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) return false;
  if (file === "scripts/npm-release-lib.mjs") return true;
  if (!/^(?:packages\/[^/]+|apps\/lab)\/src\//u.test(file)) return false;
  if (file.includes("/ui/") || file.endsWith("/cli.ts") || file.endsWith("/index.ts")) return false;
  if (file === "apps/lab/src/main/index.ts") return false;
  if (file.startsWith("apps/lab/src/main/storage/")) return false;
  if (file.startsWith("apps/lab/src/renderer/")) return false;
  return true;
}

function isCoverableFallbackLine(sourceLine) {
  const trimmed = sourceLine.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/*") &&
    !trimmed.startsWith("*") &&
    trimmed !== "*/"
  );
}

async function resolveBaseCommit(rootDir, requestedBase) {
  const candidate = requestedBase && !ZERO_SHA.test(requestedBase) ? requestedBase : "HEAD^";
  const { stdout } = await execFile(
    SYSTEM_GIT,
    ["rev-parse", "--verify", `${candidate}^{commit}`],
    {
      cwd: rootDir,
    }
  );
  return stdout.trim();
}

function percentage(numerator, denominator) {
  return Math.floor((numerator / denominator) * 10_000) / 100;
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--base") {
      options.base = requireArgumentValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--target") {
      options.target = Number.parseFloat(requireArgumentValue(argv, index, argument));
      index += 1;
      continue;
    }
    throw new Error(`Unknown patch coverage argument: ${argument}`);
  }
  return options;
}

function requireArgumentValue(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for patch coverage argument: ${argument}`);
  }
  return value;
}

async function main() {
  const result = await checkPatchCoverage(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) {
    throw new Error(
      `Patch coverage ${result.coverage.toFixed(2)}% is below the required ${result.target.toFixed(2)}%`
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
