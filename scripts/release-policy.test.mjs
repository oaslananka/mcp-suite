import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prePush = readFileSync(new URL("../.husky/pre-push", import.meta.url), "utf8");
const pullRequestTemplate = readFileSync(
  new URL("../.github/PULL_REQUEST_TEMPLATE.md", import.meta.url),
  "utf8"
);

test("repository release guidance uses release-please instead of Changesets", () => {
  assert.doesNotMatch(prePush, /\.changeset|pnpm changeset/i);
  assert.match(prePush, /release-preflight\.mjs/);
  assert.doesNotMatch(pullRequestTemplate, /pnpm changeset/i);
  assert.match(pullRequestTemplate, /release-please manifest/i);
});

test("Release Please uses a dedicated token so release PRs trigger required CI", () => {
  const releaseWorkflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );

  assert.match(
    releaseWorkflow,
    /googleapis\/release-please-action@[a-f0-9]{40}[\s\S]*token:\s+\$\{\{ secrets\.RELEASE_PLEASE_TOKEN \}\}/
  );
  assert.doesNotMatch(
    releaseWorkflow,
    /token:\s+\$\{\{\s*(?:github\.token|secrets\.GITHUB_TOKEN)\s*\}\}/
  );
});

test("npm publication uses OIDC by default and isolates the one-time bootstrap token", () => {
  const publishWorkflow = readFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8"
  );

  assert.match(publishWorkflow, /id-token:\s+write/);
  assert.match(publishWorkflow, /environment:\s+npm-production/);
  assert.match(publishWorkflow, /options:\s*\n\s*- oidc\s*\n\s*- bootstrap/);
  assert.match(publishWorkflow, /NPM_BOOTSTRAP_TOKEN/);
  assert.doesNotMatch(publishWorkflow, /secrets\.NPM_TOKEN/);
  assert.doesNotMatch(publishWorkflow, /NODE_AUTH_TOKEN:/);
  assert.match(publishWorkflow, /scripts\/publish-npm-artifacts\.mjs/);
});

test("release and publish workflows verify immutable npm artifacts before publication", () => {
  const releaseWorkflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );
  const publishWorkflow = readFileSync(
    new URL("../.github/workflows/publish.yml", import.meta.url),
    "utf8"
  );

  assert.match(releaseWorkflow, /scripts\/verify-npm-artifacts\.mjs/);
  assert.match(releaseWorkflow, /npm-release-manifest\.json/);
  assert.match(releaseWorkflow, /scripts\/smoke-npm-packages\.mjs[\s\S]*--source tarballs/);
  assert.match(releaseWorkflow, /actions\/attest-build-provenance@[a-f0-9]{40}/);

  assert.match(publishWorkflow, /sha256sum --check artifacts\/SHA256SUMS\.txt/);
  assert.match(publishWorkflow, /gh attestation verify/);
  assert.match(publishWorkflow, /--signer-workflow[\s\S]*release\.yml/);
  assert.match(publishWorkflow, /--source-ref refs\/heads\/main/);
  assert.match(publishWorkflow, /scripts\/smoke-npm-packages\.mjs[\s\S]*--source registry/);
});

test("release state supports integrity-checked recovery from partial npm publication", () => {
  const releaseState = readFileSync(new URL("release-state.mjs", import.meta.url), "utf8");

  assert.match(releaseState, /partial-publication/);
  assert.match(releaseState, /already_published/);
  assert.match(releaseState, /pending_publication/);
  assert.doesNotMatch(releaseState, /existingVersions\.length === 0 &&/);
});

test("required CI verifies clean-installable npm tarballs", () => {
  const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(ciWorkflow, /name: Verify npm package tarballs/);
  assert.match(ciWorkflow, /scripts\/pack-npm-artifacts\.mjs/);
  assert.match(ciWorkflow, /scripts\/verify-npm-artifacts\.mjs/);
  assert.match(ciWorkflow, /scripts\/smoke-npm-packages\.mjs[\s\S]*--source tarballs/);
});

test("Codecov includes the npm release trust boundary and CI enforces its coverage", () => {
  const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const codecov = readFileSync(new URL("../codecov.yml", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(ciWorkflow, /name: Toolchain trust-boundary coverage/);
  assert.match(ciWorkflow, /pnpm run toolchain:test:coverage/);
  assert.doesNotMatch(codecov, /^\s*- ["']scripts\/\*\*["']\s*$/mu);
  assert.match(codecov, /npm-release-lib\\.mjs/);
  assert.match(packageJson.scripts["toolchain:test:coverage"], /--check-coverage/);
  assert.match(packageJson.scripts["toolchain:test:coverage"], /--lines 90/);
  assert.match(packageJson.scripts["toolchain:test:coverage"], /--branches 80/);
});

test("required CI enforces deterministic patch coverage before external reporting", () => {
  const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(ciWorkflow, /fetch-depth: 0/);
  assert.match(ciWorkflow, /name: Enforce patch coverage/);
  assert.match(ciWorkflow, /github\.event\.pull_request\.base\.sha \|\| github\.event\.before/);
  assert.match(ciWorkflow, /pnpm run patch:coverage[\s\S]*--target 80/);
  assert.equal(packageJson.scripts["patch:coverage"], "node scripts/patch-coverage.mjs");
  assert.match(packageJson.scripts["toolchain:test"], /patch-coverage\.test\.mjs/);
});
