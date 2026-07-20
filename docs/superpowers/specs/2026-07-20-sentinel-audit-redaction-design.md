# Sentinel Audit Redaction Design

## Goal

Guarantee that Sentinel never persists raw credentials, cookies, API keys, tokens, secrets, or detected PII in the audit SQLite database, error column, JSON export, or CSV export.

## Security Boundary

`AuditLog.record()` is the mandatory persistence boundary. Callers may pass the original request needed for policy evaluation and upstream execution, but AuditLog must create a detached, sanitized representation before serialization. Redaction cannot be disabled.

The boundary covers:

- case-insensitive sensitive header names such as `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, and `x-api-key`;
- nested request keys ending in or representing tokens, secrets, passwords, credentials, private keys, session identifiers, or API keys;
- known credential text formats in otherwise unstructured strings, including bearer tokens, JWTs, Sentinel virtual keys, GitHub-style tokens, and common `key=value` secret forms;
- existing PII patterns handled by `PIIDetector`;
- error messages, including upstream error text;
- oversized payloads, which are redacted first and then replaced with a bounded summary.

## Data Model and Migration

The existing `audit_log` table gains `redaction_version INTEGER NOT NULL DEFAULT 0`.

- New rows are inserted with redaction version `1`.
- On startup and before queries/exports, rows with version `0` are parsed, redacted, bounded, and updated in place.
- Unparseable historical request JSON is replaced with a safe remediation marker rather than returned or exported raw.
- Expired rows are removed according to the retention policy.

This migration is idempotent and does not require a destructive table rebuild.

## Configuration

`AuditLogOptions` exposes:

- `retentionDays` — default `30`;
- `maxRequestBytes` — default `65536`;
- `maxErrorBytes` — default `4096`;
- `fingerprintSecrets` — default `false`.

CLI flags and `SENTINEL_AUDIT_*` environment variables map to the same options. Fingerprinting stores only a short SHA-256 identifier in the form `[REDACTED sha256:<prefix>]`; it never stores the source value.

## Retention and Size Handling

Retention cleanup runs at construction and is available through an explicit `pruneExpired()` method. Request and error bounds are measured in UTF-8 bytes after redaction. If the redacted request exceeds the bound, Sentinel stores a valid `ToolCallRequest` with the tool name, sanitized headers, and a truncation marker instead of a partial JSON document.

## Export Safety

JSON export is generated from already-remediated rows. CSV values are RFC 4180 escaped, and cells beginning with spreadsheet formula characters are prefixed with an apostrophe to prevent formula execution.

## At-Rest Encryption

The default `better-sqlite3` build does not provide transparent database encryption. Documentation will require restrictive filesystem permissions and describe deployment on an encrypted volume or a separately validated SQLCipher-compatible SQLite build. Encryption keys must remain outside the database and process arguments.

## Non-goals

- Persisting raw secrets behind an opt-out or debug switch.
- Replacing the existing runtime PII response middleware.
- Introducing a remote audit backend or key-management service.
- Claiming native SQLite encryption where the bundled driver does not provide it.
