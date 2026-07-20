# Security

## Supported Runtime

The supported production runtime is Node.js 24 LTS. CI, Dockerfiles, and package engines are aligned to that target.

## Remote API Boundaries

Remote HTTP APIs must fail closed:

- Forge `/api/*` requires a bearer token configured with `FORGE_API_TOKEN`.
- Forge CORS permits only `FORGE_ALLOWED_ORIGINS` or explicit constructor options.
- Atlas submissions require `ATLAS_SUBMISSION_TOKEN`.
- Health and UI endpoints do not expose mutation operations.

## Network Egress Policy

Workflow HTTP nodes and registry health checks use a public-URL policy that:

- Requires HTTPS by default.
- Blocks localhost, loopback, RFC1918, link-local, metadata IPs, ULA, multicast, unspecified, and reserved local targets.
- Re-checks redirect targets before following them.
- Checks DNS results for private or local addresses when resolution is enabled.
- Enforces redirect, timeout, request-size, and response-size bounds for Forge workflow HTTP calls.

## Desktop Boundary

MCP Lab keeps `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. It denies new windows, denies permission requests, prevents navigation away from the expected app origin, and uses a stdio command allowlist instead of shell command strings.

## Secret Handling

Secrets must be provided through GitHub Environments or the documented secret provider integration. Never commit `.env`, registry tokens, private keys, generated local credential files, or package-manager auth files.

## Sentinel Audit Persistence

Sentinel treats `AuditLog.record()` as a mandatory security boundary. Redaction cannot be disabled: requests and errors are copied, sanitized, bounded, and only then serialized to SQLite. The live request used by policy evaluation and upstream execution is not mutated.

The persisted representation removes sensitive authorization and cookie headers, nested token/password/secret fields, common credential formats in free-form text, and supported PII. New rows carry `redaction_version=1`. On startup and before query/export, version-zero rows are remediated in place; malformed historical JSON is replaced with a safe marker. JSON and CSV exports therefore operate only on remediated records, and CSV formula cells are neutralized.

Default controls are:

- 30-day retention;
- 65,536 UTF-8 bytes per redacted request;
- 4,096 UTF-8 bytes per redacted error;
- secret fingerprinting disabled.

Configure them with `SENTINEL_AUDIT_RETENTION_DAYS`, `SENTINEL_AUDIT_MAX_REQUEST_BYTES`, `SENTINEL_AUDIT_MAX_ERROR_BYTES`, and `SENTINEL_AUDIT_FINGERPRINT_SECRETS`, or the corresponding `sentinel proxy --audit-*` options. Invalid values fail before the database is opened.

Fingerprint mode stores only a 12-character SHA-256 prefix inside the redaction marker. It does not store the source secret, but it permits equality correlation between records and should remain disabled unless that behavior is required.

### Encryption at rest

The bundled `better-sqlite3` package does not provide transparent SQLCipher encryption. Production deployments must use one of these explicitly validated controls:

1. Place `SENTINEL_DB_PATH` on an encrypted filesystem or block volume and restrict the mount to the Sentinel service account.
2. Use a separately built and tested SQLCipher-compatible SQLite driver, keeping the key in a secret manager or protected mounted file.

Do not place encryption keys in the SQLite database, repository, process arguments, shell history, or generated audit exports. On Linux, create the data directory with mode `0700` and the database file with mode `0600`; also protect WAL and shared-memory sidecar files with the same ownership boundary.

Sentinel enables SQLite `secure_delete` before retention and historical remediation. This reduces recoverability from deleted cells in the active database, but it cannot erase bytes already copied into WAL files, filesystem snapshots, volume snapshots, backups, replicas, or storage-controller caches. After upgrading an existing database that may contain raw secrets, rotate affected credentials, checkpoint and replace the database during a maintenance window, and remove or expire pre-remediation backups according to the storage platform's secure-deletion procedure.
