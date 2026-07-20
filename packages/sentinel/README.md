# @oaslananka/sentinel

Zero-trust MCP proxy with key management, policy enforcement, audit logging, approval gates, and PII controls.

## Install

```bash
npm install -g @oaslananka/sentinel
```

## Quick Start

```bash
sentinel keys create --name local-dev --allow-tool "*"
sentinel pii-scan "Contact me at ops@example.com" --redact
sentinel proxy --upstream-url http://localhost:3000/mcp
```

## Example

```bash
sentinel proxy \
  --upstream-url http://127.0.0.1:4010/mcp \
  --db ./data/sentinel.sqlite \
  --audit-retention-days 30 \
  --audit-max-request-bytes 65536 \
  --audit-max-error-bytes 4096 \
  --audit-fingerprint-secrets false
```

Equivalent environment variables are available:

```bash
SENTINEL_AUDIT_RETENTION_DAYS=30
SENTINEL_AUDIT_MAX_REQUEST_BYTES=65536
SENTINEL_AUDIT_MAX_ERROR_BYTES=4096
SENTINEL_AUDIT_FINGERPRINT_SECRETS=false
```

Invalid values are rejected before the audit database is opened.

## Audit Persistence Safety

Audit redaction is mandatory and cannot be disabled. Sentinel sanitizes a detached copy of every request immediately before SQLite serialization. Runtime request objects remain available to policy and upstream execution without being modified.

The persistence boundary removes:

- authorization, proxy authorization, cookie, set-cookie, and API-key headers;
- nested token, secret, password, credential, private-key, and session fields;
- bearer tokens, JWTs, Sentinel virtual keys, GitHub-style tokens, and common `key=value` credentials in free-form text;
- supported PII patterns in request fields and error messages.

New records use `redaction_version=1`. Existing version-zero records are remediated in place when Sentinel opens or reads the database. Malformed historical request JSON is replaced with a safe remediation marker instead of being returned or exported raw.

Defaults:

| Setting                |            Default |      Accepted range |
| ---------------------- | -----------------: | ------------------: |
| Retention              |            30 days |         1-3650 days |
| Redacted request limit | 65,536 UTF-8 bytes | 256-1,048,576 bytes |
| Redacted error limit   |  4,096 UTF-8 bytes |     64-65,536 bytes |
| Secret fingerprints    |           disabled |   `true` or `false` |

When fingerprinting is enabled, Sentinel stores only a short SHA-256 marker such as `[REDACTED sha256:012345abcdef]`. This supports correlation across events but can reveal that two records contained the same secret, so leave it disabled unless that operational trade-off is intentional.

JSON and CSV exports are generated from remediated records. CSV output applies RFC 4180 escaping and prefixes spreadsheet formula cells to prevent formula execution.

The bundled `better-sqlite3` driver does not transparently encrypt the database. Store the database on an encrypted volume or use a separately validated SQLCipher-compatible deployment. Restrict the database directory to the Sentinel service account and keep any encryption key outside the database and command-line arguments. Sentinel enables SQLite `secure_delete`, but historical WAL files, snapshots, and backups can still retain pre-remediation bytes; rotate exposed credentials and retire old copies during the upgrade procedure. See [Security](../../docs/security.md#sentinel-audit-persistence).

## Core Features

- virtual key lifecycle and rotation
- request and response pipelines
- audit trail export
- approval hold workflow
- PII detection and redaction including TR-specific patterns

## Works Well With

Sentinel is most effective in front of `@oaslananka/composer` or `@oaslananka/forge`, where one policy layer can protect many downstream MCP tools and pipeline runs.
