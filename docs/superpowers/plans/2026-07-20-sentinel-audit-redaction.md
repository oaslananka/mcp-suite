# Sentinel Audit Redaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before opening a PR.

**Goal:** Prevent raw credentials, secrets, and PII from entering Sentinel audit persistence or exports while adding bounded storage, retention, historical remediation, and operator documentation.

**Architecture:** Add a dedicated audit redactor used exclusively at the `AuditLog` persistence boundary. Version stored rows, remediate historical version-zero rows in place, and make query/export operate only on remediated records. Keep runtime request objects untouched for policy and upstream execution.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Node crypto, Commander.

---

### Task 1: Redaction policy and secret classification

**Files:**

- Create: `packages/sentinel/src/audit/AuditRedactor.ts`
- Create: `packages/sentinel/tests/audit-redactor.test.ts`
- Modify: `packages/sentinel/src/index.ts`

- [x] Add failing tests for case-insensitive headers, nested secret keys, arrays, PII, bearer/JWT/virtual-key text, and deterministic optional fingerprints.
- [x] Implement detached recursive redaction with cycle/depth handling.
- [x] Implement UTF-8 request/error size bounds after redaction.
- [x] Run focused tests and typecheck.
- [x] Commit the task.

### Task 2: Persistence migration and retention

**Files:**

- Modify: `packages/sentinel/src/audit/AuditLog.ts`
- Create: `packages/sentinel/tests/audit-log-security.test.ts`

- [x] Add failing raw-SQLite assertions proving secrets currently reach `request_json` and `error`.
- [x] Add `redaction_version` schema migration and version-one inserts.
- [x] Remediate historical rows, including malformed JSON, before query/export.
- [x] Add configurable 30-day default retention and explicit pruning.
- [x] Verify oversized inputs remain valid, bounded, and sanitized.
- [x] Verify JSON and CSV exports contain no raw secrets and CSV is injection-safe.
- [x] Commit the task.

### Task 3: CLI configuration and documentation

**Files:**

- Modify: `packages/sentinel/src/cli.ts`
- Modify: `packages/sentinel/README.md`
- Modify: `.env.example`
- Modify: `docs/security.md`

- [x] Add CLI/env configuration for retention, request/error limits, and fingerprint mode.
- [x] Document immutable redaction behavior, defaults, historical remediation, and operational impact.
- [x] Document filesystem permissions and optional encrypted-volume/SQLCipher deployment without claiming built-in encryption.
- [x] Run package docs/format checks.
- [x] Commit the task.

### Task 4: Full verification and delivery

- [x] Run Sentinel focused tests, root format/lint/typecheck/build/coverage/security/knip, metadata validation, and release dry-run under the canonical toolchain.
- [x] Inspect raw SQLite rows and exported JSON/CSV for every fixture secret.
- [x] Push the branch and open a PR linked to issue #36 with validation evidence.
