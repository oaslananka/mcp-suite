#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const version = process.argv[2];
const changelogPath = path.resolve("CHANGELOG.md");

if (!version || !fs.existsSync(changelogPath)) {
  process.stdout.write("");
  process.exit(0);
}

const contents = fs.readFileSync(changelogPath, "utf8");
const marker = `## ${version}`;
const start = contents.indexOf(marker);

if (start === -1) {
  process.stdout.write(contents);
  process.exit(0);
}

const next = contents.indexOf("\n## ", start + marker.length);
const section = next === -1 ? contents.slice(start) : contents.slice(start, next);
process.stdout.write(section.trim());
