# @oaslananka/atlas

Registry and installation workflow for discovering, scoring, and validating MCP servers.

## Install

```bash
npm install -g @oaslananka/atlas
```

## Quick Start

```bash
atlas seed
atlas serve --port 4003
atlas search github --verified
```

## Example

```bash
curl http://127.0.0.1:4003/api/servers?q=github
curl http://127.0.0.1:4003/api/trending
```

## Playground

For a seeded local demo, run the workspace [local playground](../../docs/guide/playground.md):

```bash
pnpm build
pnpm run playground:seed
pnpm run playground:atlas
```

## Core Features

- searchable MCP server catalog
- seed data for known servers
- HTTP registry API
- install and verification helpers
- uptime and health tracking

## Works Well With

Atlas complements `@oaslananka/bridge` for generated servers and `@oaslananka/forge` for pipelines that need discovery before execution.

## Protocol-aware MCP health

Atlas no longer treats a running process or an arbitrary homepage `/health` response as proof that an MCP server is ready. Registry records may define an explicit `healthConfig` for the real MCP transport:

```json
{
  "transport": ["http"],
  "healthConfig": {
    "transport": "http",
    "url": "https://mcp.example.com/mcp",
    "timeoutMs": 10000,
    "maxResponseBytes": 1000000,
    "headersFromEnv": {
      "authorization": "EXAMPLE_MCP_TOKEN"
    }
  }
}
```

HTTP probes use the shared pinned-DNS outbound policy, disallow redirects, require HTTPS, block private and special-use targets, bound request time and response size, and never persist secret values. `headersFromEnv` stores only environment variable names. Transport-managed headers such as `Host`, `Content-Type`, `MCP-Protocol-Version`, and `Mcp-Session-Id` cannot be overridden.

Private-network HTTP targets require an exact `trustedPrivateHosts` entry in the registry record. Wildcards and URLs are not accepted. This is a deliberate trust-boundary opt-in and should be limited to operator-controlled records.

Stdio records use an exact executable and argument array:

```json
{
  "transport": ["stdio"],
  "healthConfig": {
    "transport": "stdio",
    "command": "/usr/local/bin/example-mcp",
    "args": ["--stdio"],
    "timeoutMs": 10000,
    "maxOutputBytes": 1000000,
    "envFrom": {
      "EXAMPLE_TOKEN": "EXAMPLE_MCP_TOKEN"
    }
  }
}
```

Atlas executes stdio probes with `shell: false`. The command must be an absolute path and must also appear in the operator allowlist. Environment values are copied only from named source variables; the full Atlas process environment is not inherited by the child.

Run one check or all verified records:

```bash
atlas health check <server-id> --db ./data/atlas.sqlite
ATLAS_HEALTH_STDIO_COMMANDS=/usr/local/bin/example-mcp atlas health check-all
```

A successful check performs `initialize`, verifies the negotiated protocol version, sends `notifications/initialized`, and performs `tools/list` when the server advertises the tools capability. Results separately record transport liveness, MCP readiness, capability verification, latency, negotiated protocol, failure category, and last successful MCP check. Atlas quality scoring rewards verified MCP readiness rather than generic process survival.
