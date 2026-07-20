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
