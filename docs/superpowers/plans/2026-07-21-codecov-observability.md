# Codecov Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable Codecov coverage, failed-test analytics, monorepo components, and Vite bundle analysis without duplicating SonarQube Cloud's maintainability gate.

**Architecture:** The canonical Ubuntu quality job remains the only job that generates and uploads coverage. A small tested repository script discovers reports actually produced by Vitest, then the current Codecov Action v7 uploads coverage and test results through GitHub OIDC, with tokenless fallback for public fork pull requests. Atlas and Observatory attach the Codecov Vite plugin only when a trusted GitHub CI build explicitly enables bundle analysis.

**Tech Stack:** GitHub Actions, Codecov Action v7, Codecov Vite Plugin 2.0.1, Vitest 4 JUnit/LCOV reports, Node.js 24, pnpm 10.

## Global Constraints

- Keep SonarQube Cloud as the code-quality, reliability, and hotspot gate.
- Make Codecov the only dedicated coverage gate.
- Pin every GitHub Action to a full commit SHA.
- Use OIDC for trusted first-party uploads; do not add a long-lived Codecov token requirement.
- Do not enable bundle uploads in local builds or untrusted fork builds.
- Preserve the existing Node 24.18.x and pnpm 10.33.x repository contract.

---

### Task 1: Deterministic report discovery

**Files:**

- Create: `scripts/codecov-reports.mjs`
- Create: `scripts/codecov-reports.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `collectCodecovReports(rootDir)` returning `{ coverageFiles: string[], testResultFiles: string[] }`.
- Produces: CLI outputs `coverage_files` and `test_result_files` as comma-separated repository-relative paths to `$GITHUB_OUTPUT`.

- [x] **Step 1: Write failing Node tests**

Create temporary package, app, integration, ignored `node_modules`, and unrelated XML fixtures. Assert only `coverage/lcov.info` and `test-results/junit.xml` files are returned in sorted repository-relative form.

- [x] **Step 2: Run tests and verify RED**

Run: `node --test scripts/codecov-reports.test.mjs`

Expected: FAIL because `scripts/codecov-reports.mjs` does not exist.

- [x] **Step 3: Implement the minimal collector and GitHub output writer**

Walk the repository recursively, prune `.git`, `node_modules`, `dist`, and generated API docs, classify exact report suffixes, sort paths, and append outputs to `$GITHUB_OUTPUT` when present.

- [x] **Step 4: Run tests and verify GREEN**

Run: `node --test scripts/codecov-reports.test.mjs`

Expected: all report-discovery tests pass.

- [x] **Step 5: Add the test to the repository automation test command**

Add `scripts/codecov-reports.test.mjs` to `toolchain:test` so local and CI policy tests cover it.

### Task 2: Codecov repository policy

**Files:**

- Create: `codecov.yml`

**Interfaces:**

- Consumes: merged LCOV reports from the canonical quality job.
- Produces: `codecov/project` and `codecov/patch` checks with `target: auto` and `threshold: 1%`.

- [x] **Step 1: Add project and patch status policy**

Configure project and patch checks with automatic targets, one-percent tolerated drift, base auto-selection, and changes-only PR comments.

- [x] **Step 2: Add stable monorepo components**

Define components for shared, forge, sentinel, atlas, composer, bridge, observatory, and lab using stable component IDs and package/app path filters.

- [x] **Step 3: Validate against Codecov**

Run: `curl --fail-with-body --data-binary @codecov.yml https://codecov.io/validate`

Expected: HTTP 200 and a valid configuration response.

### Task 3: Coverage and test-results upload

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `coverage_files` and `test_result_files` from `scripts/codecov-reports.mjs`.
- Uses: `codecov/codecov-action` at commit `fb8b3582c8e4def4969c97caa2f19720cb33a72f` (v7.0.0).

- [x] **Step 1: Grant only the quality job OIDC permission**

Keep workflow-level `contents: read`; add `id-token: write` to the quality job only.

- [x] **Step 2: Discover reports after the coverage step**

Run the collector with `if: ${{ !cancelled() }}` so partial JUnit reports remain available after test failures.

- [x] **Step 3: Upload coverage reports**

Invoke Codecov Action v7 with `use_oidc: true`, `disable_search: true`, explicit discovered files, disabled telemetry, and fail-on-uploader-error behavior.

- [x] **Step 4: Upload JUnit test results**

Invoke the same composite Codecov Action v7 with `report_type: test_results`, explicit discovered JUnit files, and `if: ${{ !cancelled() }}`. This avoids introducing the separate test-results action whose current release still declares a Node 20 runtime.

### Task 4: Trusted Vite bundle analysis

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/atlas/ui/vite.config.ts`
- Modify: `packages/observatory/ui/vite.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: environment variable `CODECOV_BUNDLE_ANALYSIS=true` only in trusted GitHub CI.
- Produces: bundle names `mcp-suite-atlas-ui` and `mcp-suite-observatory-ui`.

- [x] **Step 1: Add `@codecov/vite-plugin@2.0.1` as a root dev dependency**

Run: `pnpm add -Dw @codecov/vite-plugin@2.0.1`

- [x] **Step 2: Configure Atlas and Observatory**

Append the Codecov plugin after React, enable it only when `CODECOV_BUNDLE_ANALYSIS` equals `true`, use GitHub OIDC, set stable bundle names, and disable plugin telemetry.

- [x] **Step 3: Enable trusted CI builds only**

Set `CODECOV_BUNDLE_ANALYSIS=true` for push builds and same-repository pull requests; leave it disabled for forks.

- [x] **Step 4: Verify disabled local builds**

Run Atlas and Observatory UI builds without the environment variable and confirm no upload is attempted.

### Task 5: Documentation and complete verification

**Files:**

- Modify: `docs/testing.md`
- Modify: `docs/operations.md`
- Modify: `README.md`

**Interfaces:**

- Documents: Codecov GitHub App prerequisite, OIDC behavior, fork behavior, component model, bundle names, and coverage-gate ownership.

- [x] **Step 1: Document operator and contributor behavior**

Explain how reports are generated, uploaded after failures, authenticated, and separated from SonarQube Cloud responsibilities.

- [ ] **Step 2: Add the Codecov badge**

Add a repository coverage badge only after the Codecov project is configured and the first upload succeeds.

- [x] **Step 3: Run focused validation**

Run report tests, actionlint, zizmor, Prettier, TypeScript checks, Atlas/Observatory builds, and Codecov YAML validation.

- [x] **Step 4: Run full uncached CI**

Run: `TURBO_FORCE=true pnpm run ci`

Expected: all tests, coverage thresholds, security checks, builds, production smoke, and release preflight pass.

- [ ] **Step 5: Open PR and inspect all bots/agents**

Review Codecov, SonarQube Cloud, CodeQL, DeepScan, Snyk, Aikido, Socket, dependency review, workflow lint, container matrix, and review-thread gate output. Resolve every actionable finding before merge.
