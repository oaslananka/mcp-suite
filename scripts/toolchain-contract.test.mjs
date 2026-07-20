import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactVersion,
  readToolVersions,
  resolvePnpmVersion,
  validateRepositorySnapshot,
} from "./toolchain-contract.mjs";

test("readToolVersions parses the canonical node and pnpm versions", () => {
  const contract = readToolVersions("node 24.18.0\npnpm 10.33.0\n");

  assert.deepEqual(contract, {
    node: "24.18.0",
    pnpm: "10.33.0",
  });
});

test("resolvePnpmVersion prefers an explicit trusted version", () => {
  assert.equal(
    resolvePnpmVersion({
      declaredVersion: "10.33.0",
      userAgent: "pnpm/99.0.0 npm/? node/v24.18.0 linux x64",
    }),
    "10.33.0"
  );
});

test("resolvePnpmVersion reads pnpm from the lifecycle user agent", () => {
  assert.equal(
    resolvePnpmVersion({ userAgent: "pnpm/10.33.0 npm/? node/v24.18.0 linux x64" }),
    "10.33.0"
  );
});

test("resolvePnpmVersion refuses to search the process PATH", () => {
  assert.throws(
    () => resolvePnpmVersion({}),
    /Unable to determine pnpm version without executing a PATH-resolved command/
  );
});

test("assertExactVersion reports the actual and expected versions", () => {
  assert.throws(
    () => assertExactVersion("v22.23.1", "24.18.0", "Node.js"),
    /Node\.js version mismatch: expected 24\.18\.0, received 22\.23\.1/
  );
});

test("validateRepositorySnapshot rejects active Node 20 or Node 22 configuration", () => {
  const snapshot = {
    packageJson: {
      engines: { node: "24.18.x", pnpm: "10.33.x" },
      packageManager: "pnpm@10.33.0",
    },
    files: new Map([
      [".azure/pipelines/main.yml", "variables:\n  NODE_VERSION: 20.x\n"],
      [
        ".devcontainer/devcontainer.json",
        '{"image":"mcr.microsoft.com/devcontainers/typescript-node:22"}',
      ],
    ]),
  };

  assert.throws(
    () =>
      validateRepositorySnapshot(snapshot, {
        node: "24.18.0",
        pnpm: "10.33.0",
      }),
    /Node 20 or Node 22 selection.*\.azure\/pipelines\/main\.yml.*\.devcontainer\/devcontainer\.json/s
  );
});

test("validateRepositorySnapshot rejects Docker runtime and pnpm drift", () => {
  const snapshot = {
    packageJson: {
      engines: { node: "24.18.x", pnpm: "10.33.x" },
      packageManager: "pnpm@10.33.0",
    },
    files: new Map([
      [
        "packages/forge/Dockerfile",
        "FROM node:22-alpine\nRUN corepack prepare pnpm@10.34.0 --activate\n",
      ],
    ]),
  };

  assert.throws(
    () =>
      validateRepositorySnapshot(snapshot, {
        node: "24.18.0",
        pnpm: "10.33.0",
      }),
    /Node 20 or Node 22 selection.*packages\/forge\/Dockerfile.*pnpm 10\.34\.0.*expected 10\.33\.0/s
  );
});
