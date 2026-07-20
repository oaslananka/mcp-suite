import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const scriptPath = new URL("scripts/sync-to-github.sh", root).pathname;
const script = readFileSync(scriptPath, "utf8");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "mcp-suite-mirror-"));
  const source = path.join(directory, "source");
  const remote = path.join(directory, "remote.git");
  git(directory, ["init", "--bare", remote]);
  git(directory, ["init", "-b", "main", source]);
  git(source, ["config", "user.name", "Mirror Test"]);
  git(source, ["config", "user.email", "mirror@example.test"]);
  git(source, ["commit", "--allow-empty", "-m", "initial"]);
  git(source, ["push", remote, "HEAD:main"]);
  return { directory, source, remote };
}

function runMirror(source, remote, extraEnv = {}) {
  return spawnSync("bash", [scriptPath], {
    cwd: source,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPO: "oaslananka/mcp-suite",
      GITHUB_REMOTE_URL: remote,
      GITHUB_TOKEN: "test-token-must-never-persist",
      MIRROR_DIRECTION: "azure-to-github",
      MIRROR_TEST_MODE: "1",
      ...extraEnv,
    },
  });
}

test("mirror implementation never embeds credentials or force-updates protected refs", () => {
  assert.doesNotMatch(script, /x-access-token:\$\{?GITHUB_TOKEN/i);
  assert.doesNotMatch(script, /remote\s+(?:add|set-url)/);
  assert.doesNotMatch(script, /--force(?:-with-lease)?/);
  assert.match(script, /GIT_ASKPASS/);
  assert.match(script, /HEAD:refs\/heads\/main/);
  assert.match(script, /MIRROR_DIRECTION/);
});

test("fast-forward mirror advances main, publishes missing tags, and leaves config credential-free", () => {
  const fixture = createFixture();
  try {
    git(fixture.source, ["commit", "--allow-empty", "-m", "next"]);
    git(fixture.source, ["tag", "v-test"]);
    const expectedHead = git(fixture.source, ["rev-parse", "HEAD"]);
    const expectedTag = git(fixture.source, ["rev-parse", "refs/tags/v-test"]);

    const result = runMirror(fixture.source, fixture.remote);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(git(fixture.remote, ["rev-parse", "refs/heads/main"]), expectedHead);
    assert.equal(git(fixture.remote, ["rev-parse", "refs/tags/v-test"]), expectedTag);
    assert.doesNotMatch(
      readFileSync(path.join(fixture.source, ".git", "config"), "utf8"),
      /test-token/
    );
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /test-token/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("divergence fails closed without changing remote main", () => {
  const fixture = createFixture();
  try {
    git(fixture.source, ["commit", "--allow-empty", "-m", "source-change"]);
    const other = path.join(fixture.directory, "other");
    git(fixture.directory, ["clone", fixture.remote, other]);
    git(other, ["config", "user.name", "Mirror Test"]);
    git(other, ["config", "user.email", "mirror@example.test"]);
    git(other, ["commit", "--allow-empty", "-m", "remote-change"]);
    git(other, ["push", "origin", "HEAD:main"]);
    const remoteBefore = git(fixture.remote, ["rev-parse", "refs/heads/main"]);

    const result = runMirror(fixture.source, fixture.remote);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /diverg|fast-forward/i);
    assert.equal(git(fixture.remote, ["rev-parse", "refs/heads/main"]), remoteBefore);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("existing conflicting tags are never rewritten", () => {
  const fixture = createFixture();
  try {
    git(fixture.source, ["tag", "release-test"]);
    const tagBefore = git(fixture.remote, ["rev-parse", "refs/heads/main"]);
    git(fixture.remote, ["update-ref", "refs/tags/release-test", tagBefore]);
    git(fixture.source, ["commit", "--allow-empty", "-m", "move-local-tag-target"]);
    git(fixture.source, ["tag", "-f", "release-test"]);
    const remoteTagBefore = git(fixture.remote, ["rev-parse", "refs/tags/release-test"]);

    const result = runMirror(fixture.source, fixture.remote);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /tag.*conflict|refus/i);
    assert.equal(git(fixture.remote, ["rev-parse", "refs/tags/release-test"]), remoteTagBefore);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
