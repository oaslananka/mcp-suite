# Node 24 Toolchain Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Node.js `24.18.0` and pnpm `10.33.0` across monorepo development, CI, Azure Pipelines, releases, and devcontainers, including a native ABI smoke test.

**Architecture:** `.tool-versions` is the canonical contract. Dependency-free Node scripts validate repository configuration and the active runtime before installation, while a post-install script validates `better-sqlite3` against the selected Node ABI. Automation consumes or checks this contract rather than maintaining silent version drift.

**Tech Stack:** Node.js ESM, Node test runner, pnpm/Corepack, GitHub Actions, Azure Pipelines, Dev Containers.

## Global Constraints

- Canonical Node version: `24.18.0`.
- Canonical pnpm version: `10.33.0`.
- Published package engine floors remain `node >=24.0.0`.
- No active workflow or devcontainer may select Node 20 or Node 22.
- Validation scripts must run before workspace dependencies are installed.

---

### Task 1: Canonical contract and dependency-free validator

**Files:**

- Create: `.tool-versions`
- Create: `scripts/toolchain-contract.mjs`
- Create: `scripts/toolchain-contract.test.mjs`
- Create: `scripts/verify-toolchain.mjs`
- Modify: `package.json`
- Create: `.npmrc`

**Interfaces:**

- Produces: `readToolVersions(text)`, `assertExactVersion(actual, expected, label)`, `validateRepository(rootDir, contract)`, and CLI modes `--runtime`/`--repository`/`--all`.

- [x] Write Node test-runner tests for parsing, mismatch diagnostics, and forbidden Node 20/22 configuration.
- [x] Run `node --test scripts/toolchain-contract.test.mjs` and verify failure because the module is missing.
- [x] Implement the minimal parser and validators.
- [x] Add strict root engines, package scripts, `.npmrc`, and `.tool-versions`.
- [x] Run the focused tests and repository validation.
- [x] Commit the task.

### Task 2: Native ABI smoke check

**Files:**

- Create: `scripts/verify-native-modules.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `pnpm run toolchain:check:native`, which loads `better-sqlite3`, executes `SELECT 1`, and reports Node ABI diagnostics.

- [x] Add a testable failure path for an incompatible or missing native module.
- [x] Implement the in-memory SQLite smoke check.
- [x] Run it after a clean install under Node `24.18.0`.
- [x] Commit the task.

### Task 3: Automation and devcontainer alignment

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/docs.yml`
- Modify: `.github/workflows/publish.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.azure/templates/node-setup.yml`
- Modify: `.azure/pipelines/ci.yml`
- Modify: `.azure/pipelines/main.yml`
- Modify: `.devcontainer/devcontainer.json`

**Interfaces:**

- Consumes: `.tool-versions`, `node scripts/verify-toolchain.mjs`, `pnpm run toolchain:check:native`.

- [x] Make GitHub setup steps use exact versions and print runtime/ABI diagnostics.
- [x] Make the Azure setup template read `.tool-versions`, set pipeline variables, validate runtime, install, and validate native modules.
- [x] Remove Node 20/22 selections from active Azure/devcontainer configuration.
- [x] Run repository validation and workflow formatting checks.
- [x] Commit the task.

### Task 4: Contributor recovery documentation and full verification

**Files:**

- Modify: `docs/development.md`
- Modify: `docs/guide/installation.md`
- Modify: `docs/adr/0002-standardize-on-node-24-pnpm-turborepo.md`

**Interfaces:**

- Documents: `mise install`, `mise exec -- pnpm install --frozen-lockfile`, and native-module cleanup/reinstall commands.

- [x] Document clean bootstrap and stale ABI recovery.
- [x] Run format, lint, typecheck, build, coverage, security, knip, registry/Smithery validation, and release dry-run under the canonical runtime.
- [ ] Push the branch and open a PR linked to issue #34 with validation evidence.
