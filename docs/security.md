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
