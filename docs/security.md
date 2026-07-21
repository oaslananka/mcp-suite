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

## Remote Schema and Workflow Fetching

Bridge remote OpenAPI loading and Forge workflow HTTP nodes share one outbound request policy. The policy requires HTTPS by default, rejects embedded URL credentials and special-use IPv4/IPv6 space, validates every DNS answer, pins a reviewed address into the connection, and repeats validation for every redirect. Connection plus body-read timeouts, redirect limits, request/response byte limits, content-type checks, and cross-origin credential stripping are enforced before data reaches parsers or workflow outputs. Error messages and structured logs do not include target URLs.

Bridge supports private schema registries only through an exact-host opt-in. Use `--trusted-private-host <host...>` or `BRIDGE_TRUSTED_PRIVATE_HOSTS`; wildcard domains, URL strings, paths, credentials, and host-plus-port values are rejected. This exception permits private DNS results only for the named host. It does not disable HTTPS, address pinning, redirect validation, timeouts, or response limits. Prefer a dedicated internal hostname with restricted DNS and network ACLs rather than trusting a broad shared endpoint.

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

## Sentinel Durable Approvals

Sentinel human approvals use SQLite-backed state rather than in-memory timers. Request payloads cross the mandatory `AuditRedactor` boundary before persistence. Raw approval capabilities are never stored; only SHA-256 hashes are retained. Capabilities are request-bound, principal-bound, single-use, and expire at the earlier of Sentinel's timeout or the caller's upstream expiry.

Approval events are append-only. SQLite triggers reject update and delete operations on the event table. Terminal decisions cannot be reversed, and an atomic execution claim ensures that an approved request can release at most one upstream tool invocation even when duplicate callers are waiting concurrently.

Idempotency keys are hashed together with the requester principal. A separate request fingerprint prevents an idempotency key from authorizing a different tool, input, approver, channel set, or upstream expiry. Channel delivery failure, missing adapters, cancellation, and timeout fail closed. Fail-open timeout behavior requires an explicit library-only opt-in and should not be enabled for production security boundaries.

Treat approval capabilities as credentials. Provider adapters must avoid URLs, logs, telemetry fields, chat previews, and plaintext persistence. Prefer encrypted short-lived provider state and opaque callback identifiers. Protect the Sentinel SQLite file with restrictive filesystem permissions and encrypted storage; `secure_delete` does not remove historical bytes from backups, snapshots, or old WAL files.

## Atlas MCP Health Probes

Atlas health records must identify the exact MCP transport. Generic homepage checks and placeholder processes are not considered readiness evidence. HTTP checks reuse the shared SSRF-resistant fetch path with DNS pinning, no redirects, strict HTTPS, bounded bodies, timeout enforcement, and exact private-host opt-in. Authentication values are resolved at runtime from named environment variables and are never stored in the registry.

Stdio checks require an absolute executable path that is present in the operator allowlist. Atlas passes an argument array directly with `shell: false`, bounds stdout, applies a deadline, and supplies only explicitly mapped environment variables. A process starting successfully is not enough: the probe must complete MCP initialization and any advertised capability verification.

Health failures expose fixed categories and sanitized messages rather than raw URLs, credentials, command output, or provider errors. Registry quality scores reward only successful MCP readiness. Liveness without a valid handshake is displayed as degraded, not healthy.

### MCP SDK Hono adapter override

`@modelcontextprotocol/sdk` v1.29.0 currently declares the vulnerable v1 range of `@hono/node-server`. The workspace scopes a pnpm override to that SDK dependency only and pins `@hono/node-server` 2.0.5, which contains the encoded-backslash static-path fix. Keep the override until a production v1 MCP SDK release adopts the patched adapter; do not remove it solely because the v2 SDK is available, since v1 remains the production compatibility line used by this repository.
