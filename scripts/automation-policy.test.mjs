import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function packageDockerfiles() {
  const packagesDir = new URL("packages/", root);
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/Dockerfile`)
    .filter((path) => {
      try {
        read(path);
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

function installCommands(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("pnpm install --frozen-lockfile"));
}

test("Docker build contexts keep npm credentials excluded", () => {
  assert.match(read(".dockerignore"), /^\.npmrc$/m);

  for (const path of packageDockerfiles()) {
    assert.doesNotMatch(read(path), /COPY[^\n]*\.npmrc/, `${path} must not copy .npmrc`);
  }
});

test("automation installs dependencies without implicit lifecycle scripts", () => {
  const paths = [
    ".github/workflows/ci.yml",
    ".github/workflows/docs.yml",
    ".azure/templates/node-setup.yml",
    "scripts/bootstrap-devcontainer.sh",
    ...packageDockerfiles(),
  ];

  for (const path of paths) {
    const commands = installCommands(read(path));
    assert.ok(commands.length > 0, `${path} must contain a frozen-lockfile install`);
    for (const command of commands) {
      assert.match(command, /--ignore-scripts\b/, `${path}: ${command}`);
    }
  }
});

test("Docker base images use digest-only references", () => {
  for (const path of packageDockerfiles()) {
    const content = read(path);
    assert.doesNotMatch(content, /^FROM\s+\S+:\S+@sha256:/m, path);
    assert.match(content, /^FROM\s+\S+@sha256:[a-f0-9]{64}\s+AS\s+builder$/m, path);
    assert.match(content, /^FROM\s+\S+@sha256:[a-f0-9]{64}\s+AS\s+runtime$/m, path);
  }
});

test("devcontainer bootstrap uses safe Bash conditionals", () => {
  const content = read("scripts/bootstrap-devcontainer.sh");
  assert.match(content, /\[\[\s+-n\s+"\$\{pnpm_version\}"\s+\]\]/);
  assert.doesNotMatch(content, /^test\s+-n\s+/m);
});
