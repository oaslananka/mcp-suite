import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  evaluatePatchCoverage,
  loadLcovCoverage,
  parseArguments,
  parseUnifiedDiff,
} from "./patch-coverage.mjs";

test("parseUnifiedDiff records added line numbers and source text", () => {
  const changed =
    parseUnifiedDiff(`diff --git a/packages/shared/src/example.ts b/packages/shared/src/example.ts
--- a/packages/shared/src/example.ts
+++ b/packages/shared/src/example.ts
@@ -2 +2,2 @@
-oldValue();
+newValue();
+nextValue();
@@ -8,0 +10 @@
+finalValue();
`);

  assert.deepEqual(
    [...changed.entries()],
    [
      [
        "packages/shared/src/example.ts",
        new Map([
          [2, "newValue();"],
          [3, "nextValue();"],
          [10, "finalValue();"],
        ]),
      ],
    ]
  );
});

test("parseUnifiedDiff ignores deleted files and rejects escaping paths", () => {
  assert.deepEqual(
    parseUnifiedDiff(`diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-oldValue();
`),
    new Map()
  );

  assert.throws(
    () =>
      parseUnifiedDiff(`diff --git a/example.ts b/../../escape.ts
--- a/example.ts
+++ b/../../escape.ts
@@ -0,0 +1 @@
+escape();
`),
    /escaped the repository root/u
  );
});

test("loadLcovCoverage maps workspace-relative and repository-relative sources", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-patch-coverage-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeReport(
    root,
    "packages/shared/coverage/lcov.info",
    `TN:\nSF:src/example.ts\nDA:2,3\nDA:3,0\nend_of_record\n`
  );
  await writeReport(
    root,
    "coverage/toolchain/lcov.info",
    `TN:\nSF:scripts/npm-release-lib.mjs\nDA:10,1\nend_of_record\n`
  );

  const coverage = await loadLcovCoverage(root, [
    "packages/shared/coverage/lcov.info",
    "coverage/toolchain/lcov.info",
  ]);

  assert.deepEqual(
    coverage.get("packages/shared/src/example.ts"),
    new Map([
      [2, 3],
      [3, 0],
    ])
  );
  assert.deepEqual(coverage.get("scripts/npm-release-lib.mjs"), new Map([[10, 1]]));
});

test("loadLcovCoverage rejects source paths outside the repository", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-patch-coverage-escape-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeReport(
    root,
    "coverage/toolchain/lcov.info",
    `TN:\nSF:../../outside.mjs\nDA:1,1\nend_of_record\n`
  );

  await assert.rejects(
    loadLcovCoverage(root, ["coverage/toolchain/lcov.info"]),
    /escaped the repository root/u
  );
});

test("evaluatePatchCoverage calculates covered instrumented patch lines", () => {
  const changed = new Map([
    [
      "packages/shared/src/example.ts",
      new Map([
        [2, "covered();"],
        [3, "uncovered();"],
        [4, "type Example = string;"],
      ]),
    ],
  ]);
  const coverage = new Map([
    [
      "packages/shared/src/example.ts",
      new Map([
        [2, 1],
        [3, 0],
      ]),
    ],
  ]);

  assert.deepEqual(evaluatePatchCoverage(changed, coverage, 60), {
    target: 60,
    covered: 1,
    total: 2,
    coverage: 50,
    passed: false,
    files: [
      {
        file: "packages/shared/src/example.ts",
        covered: 1,
        total: 2,
        coverage: 50,
      },
    ],
  });
});

test("evaluatePatchCoverage treats an uninstrumented production source file as uncovered", () => {
  const changed = new Map([
    [
      "packages/shared/src/new-module.ts",
      new Map([
        [1, "// explanatory comment"],
        [2, "export function newModule() {"],
        [3, "  return true;"],
        [4, "}"],
      ]),
    ],
    ["packages/shared/tests/new-module.test.ts", new Map([[1, "test('works', () => {});"]])],
    ["packages/shared/src/index.ts", new Map([[1, "export * from './new-module.js';"]])],
  ]);

  const result = evaluatePatchCoverage(changed, new Map(), 80);
  assert.equal(result.covered, 0);
  assert.equal(result.total, 3);
  assert.equal(result.coverage, 0);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.files.map(({ file }) => file),
    ["packages/shared/src/new-module.ts"]
  );
});

test("evaluatePatchCoverage passes when a patch has no coverable source lines", () => {
  const changed = new Map([
    ["README.md", new Map([[1, "Documentation only"]])],
    ["scripts/release-policy.test.mjs", new Map([[1, "test only"]])],
  ]);

  assert.deepEqual(evaluatePatchCoverage(changed, new Map(), 80), {
    target: 80,
    covered: 0,
    total: 0,
    coverage: 100,
    passed: true,
    files: [],
  });
});

test("evaluatePatchCoverage validates the configured target", () => {
  assert.throws(() => evaluatePatchCoverage(new Map(), new Map(), 101), /between 0 and 100/u);
});

test("parseArguments accepts the package-manager separator", () => {
  assert.deepEqual(parseArguments(["--", "--base", "abc123", "--target", "81"]), {
    base: "abc123",
    target: 81,
  });
});

test("parseArguments rejects missing option values", () => {
  assert.throws(() => parseArguments(["--base"]), /Missing value.*--base/u);
  assert.throws(() => parseArguments(["--target", "--base", "abc123"]), /Missing value.*--target/u);
});

async function writeReport(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}
