import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "test-results",
  "docs/api",
  ".mcp-registry-release",
]);
const forbiddenNames = new Set([
  ".agent",
  ".cursor",
  ".claude",
  ".codex",
  "chat.md",
  "instructions.md",
  "prompt.md",
  "prompts.md",
  "scratch.md",
  "notes.local.md",
]);
const secretPatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "npm token", pattern: /npm_[A-Za-z0-9]{30,}/ },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/ },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { name: "Doppler token", pattern: /dp\.pt\.[A-Za-z0-9_.-]{20,}/ },
];
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const findings = [];

for await (const file of walk(root)) {
  const relative = path.relative(root, file).replace(/\\/g, "/");
  const base = path.basename(file).toLowerCase();
  if (forbiddenNames.has(base) || /\.transcript\.|\.chat\.|\.prompt\.|\.scratch\./u.test(relative)) {
    findings.push({ file: relative, type: "forbidden operational file" });
    continue;
  }

  if (!textExtensions.has(path.extname(file).toLowerCase())) {
    continue;
  }

  const content = await readFile(file, "utf8");
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      findings.push({ file: relative, type: name });
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: "failed", findings }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write("Security scan completed without forbidden files or high-confidence secret patterns.\n");

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(root, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name) || ignoredDirs.has(relative)) {
        continue;
      }
      yield* walk(fullPath);
      continue;
    }

    const info = await stat(fullPath);
    if (info.size > 1_000_000) {
      continue;
    }
    yield fullPath;
  }
}
