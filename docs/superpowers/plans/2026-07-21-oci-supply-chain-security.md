# OCI Supply-Chain Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete issue #13 with blocking Trivy image scans, keyless digest signatures, registry-backed GitHub attestations, architecture verification, and smoke tests against published GHCR images.

**Architecture:** Pull requests keep the existing multi-architecture build validation and additionally load an amd64 runtime image for Trivy HIGH/CRITICAL scanning, SARIF publication, and a blocking vulnerability gate. Main and component tag runs publish immutable full-SHA tags, sign each digest with Cosign using GitHub OIDC, create and verify a GitHub provenance attestation in GHCR, verify both architectures, exercise all six CLIs, and run the three HTTP services from published images. Mutable main/latest or version aliases are created only after those checks pass.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Trivy, SARIF/Code Scanning, Cosign/Sigstore, GitHub artifact attestations, Docker Compose, Node.js 24.

## Global Constraints

- Keep all third-party actions pinned to full commit SHAs.
- Default workflow permissions remain read-only; grant write scopes only per job.
- Publish only from `refs/heads/main`, explicit component release tags, or a manual dispatch pinned to main.
- Report fixed and unfixed HIGH/CRITICAL OS and language vulnerabilities; block fixable findings.
- Preserve `linux/amd64,linux/arm64` publication.
- Use immutable full-commit `sha-<40 hex>` tags for release evidence.
- Do not introduce long-lived signing keys or registry credentials.

---

### Task 1: Encode the workflow trust contract

**Files:**

- Modify: `scripts/automation-policy.test.mjs`
- Test: `scripts/automation-policy.test.mjs`

- [x] **Step 1: Add failing assertions for Trivy, SARIF, OIDC signing, attestations, immutable tags, and published-image smoke.**
- [x] **Step 2: Run `node --test scripts/automation-policy.test.mjs` and confirm failure against the current workflow.**

### Task 2: Add PR vulnerability scanning

**Files:**

- Modify: `.github/workflows/containers.yml`

- [x] **Step 1: Load a cached linux/amd64 image for every package matrix entry.**
- [x] **Step 2: Run Trivy SARIF generation and upload it to GitHub Code Scanning for trusted PRs.**
- [x] **Step 3: Run a second blocking HIGH/CRITICAL vulnerability gate for every PR, including forks.**

### Task 3: Sign and attest published digests

**Files:**

- Modify: `.github/workflows/containers.yml`

- [x] **Step 1: Restrict publishing to main and add packages, OIDC, and attestation job permissions.**
- [x] **Step 2: Publish full-SHA immutable tags with SBOM and max provenance.**
- [x] **Step 3: Sign each digest keylessly with Cosign and verify the exact workflow identity.**
- [x] **Step 4: Push a GitHub provenance attestation to GHCR and verify it with `gh attestation verify`.**
- [x] **Step 5: Verify each manifest contains linux/amd64 and linux/arm64.**

### Task 4: Smoke-test published images

**Files:**

- Create: `docker-compose.published.yml`
- Modify: `.github/workflows/containers.yml`

- [x] **Step 1: Add an image-only Compose override for Forge, Atlas, and Observatory.**
- [x] **Step 2: Pull full-SHA tags after every successful publish matrix.**
- [x] **Step 3: Start services with `--no-build`, wait for health, and run `scripts/smoke-prod-health.mjs` against published containers.**
- [x] **Step 4: Always collect Compose logs and tear down volumes.**

### Task 5: Documentation and verification

**Files:**

- Modify: `docs/containers.md`
- Modify: `docs/operations.md`

- [x] **Step 1: Document tag policy, Trivy gate, Cosign verification, GitHub attestation verification, architecture inspection, and published Compose smoke.**
- [x] **Step 2: Run automation policy tests, format, actionlint, zizmor, Docker Compose config, security, and full uncached CI.**
- [ ] **Step 3: Open a PR, inspect every bot/agent comment and review thread, resolve findings, and merge only when all checks pass.**
- [ ] **Step 4: Verify the main publish run, public package visibility, signatures, attestations, architectures, and published-image health before closing #13.**
