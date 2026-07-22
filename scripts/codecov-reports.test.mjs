import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectCodecovReports } from "./codecov-reports.mjs";

async function createFixture(root, relativePath, content = "fixture\n") {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

const validLcov = "TN:\nSF:src/example.ts\nDA:1,1\nend_of_record\n";
const validJunit =
  '<?xml version="1.0"?><testsuites tests="1"><testsuite tests="1"><testcase name="ok" /></testsuite></testsuites>';

test("collectCodecovReports returns only sorted LCOV and JUnit reports", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-codecov-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await Promise.all([
    createFixture(root, "packages/shared/coverage/lcov.info", validLcov),
    createFixture(root, "packages/bridge/coverage/lcov.info", validLcov),
    createFixture(root, "coverage/integration/lcov.info", validLcov),
    createFixture(root, "coverage/toolchain/lcov.info", validLcov),
    createFixture(root, "apps/lab/test-results/junit.xml", validJunit),
    createFixture(root, "packages/shared/test-results/junit.xml", validJunit),
    createFixture(root, "test-results/playwright/junit.xml", validJunit),
    createFixture(root, "packages/empty/coverage/lcov.info", ""),
    createFixture(root, "packages/malformed/coverage/lcov.info", "not-lcov\n"),
    createFixture(root, "packages/empty/test-results/junit.xml", ""),
    createFixture(root, "packages/malformed/test-results/junit.xml", "not-xml\n"),
    createFixture(root, "packages/shared/coverage/cobertura-coverage.xml"),
    createFixture(root, "packages/shared/coverage/coverage-summary.json"),
    createFixture(root, "node_modules/example/coverage/lcov.info"),
    createFixture(root, "packages/shared/dist/test-results/junit.xml"),
  ]);

  assert.deepEqual(await collectCodecovReports(root), {
    coverageFiles: [
      "coverage/integration/lcov.info",
      "coverage/toolchain/lcov.info",
      "packages/bridge/coverage/lcov.info",
      "packages/shared/coverage/lcov.info",
    ],
    testResultFiles: [
      "apps/lab/test-results/junit.xml",
      "packages/shared/test-results/junit.xml",
      "test-results/playwright/junit.xml",
    ],
  });
});

test("collectCodecovReports returns empty lists when no reports exist", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-codecov-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createFixture(root, "README.md");

  assert.deepEqual(await collectCodecovReports(root), {
    coverageFiles: [],
    testResultFiles: [],
  });
});
