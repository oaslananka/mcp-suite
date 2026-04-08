# MCP Infrastructure Suite

> The missing infrastructure layer for Model Context Protocol ecosystems.

[![Azure DevOps](https://img.shields.io/badge/Azure%20DevOps-primary%20CI-0078D4)](./.azure/pipelines)
[![npm scope](https://img.shields.io/badge/npm-@oaslananka-EA580C)](https://www.npmjs.com/search?q=%40oaslananka%20mcp)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![MCP Spec 2025-11-25](https://img.shields.io/badge/MCP%20Spec-2025--11--25-16A34A)](https://modelcontextprotocol.io)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220)](https://pnpm.io/)
[![Smithery Ready](https://img.shields.io/badge/Smithery-ready-111827)](https://smithery.ai/docs)

```mermaid
flowchart LR
    Shared["@oaslananka/shared"]
    Forge["@oaslananka/forge"]
    Sentinel["@oaslananka/sentinel"]
    Atlas["@oaslananka/atlas"]
    Composer["@oaslananka/composer"]
    Bridge["@oaslananka/bridge"]
    Observatory["@oaslananka/observatory"]
    Lab["@oaslananka/lab"]

    Shared --> Forge
    Shared --> Sentinel
    Shared --> Atlas
    Shared --> Composer
    Shared --> Bridge
    Shared --> Observatory
    Shared --> Lab

    Clients["IDE / Agent / SDK clients"] --> Sentinel
    Clients --> Composer
    Composer --> Backends["Backend MCP servers"]
    Sentinel --> Backends
    Forge --> Composer
    Forge --> Sentinel
    Atlas --> Clients
    Observatory --> Sentinel
    Observatory --> Forge
    Lab --> Composer
```

## Why mcp-suite?

Most MCP projects stop at the server boundary. `mcp-suite` focuses on the harder production layer around it: transport compatibility, trust boundaries, orchestration, discovery, observability, and operator workflows. That makes it useful once you move past a single local demo and start running MCP in teams, CI, or internal platforms.

The suite is Azure-first by design. Azure DevOps Pipelines are the primary CI/CD path, GitHub remains the mirror and release host, and every package is prepared for public npm publishing under the `@oaslananka` scope. The monorepo stays strict TypeScript, Turborepo, pnpm, and Changesets based.

Compared with one-off MCP utilities, the packages here are designed to compose: `shared` defines the protocol/runtime baseline, `sentinel` and `composer` control traffic, `forge` orchestrates work, `atlas` catalogs capability, `bridge` generates servers, `observatory` closes the feedback loop, and `lab` gives contributors a desktop workbench.

## Packages

| Package                   | What it does                                                                    | Docs                                               |
| ------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@oaslananka/shared`      | Shared MCP protocol, transports, auth, retry, telemetry, and testing primitives | [Shared docs](./docs/packages/shared.md)           |
| `@oaslananka/forge`       | Pipeline engine for orchestrating MCP tools and external steps                  | [Forge docs](./docs/packages/forge.md)             |
| `@oaslananka/sentinel`    | Zero-trust security proxy with audit, approval, and PII controls                | [Sentinel docs](./docs/packages/sentinel.md)       |
| `@oaslananka/atlas`       | Registry API and catalog UI for discovering MCP servers                         | [Atlas docs](./docs/packages/atlas.md)             |
| `@oaslananka/composer`    | Aggregation proxy for multiple backend MCP servers                              | [Composer docs](./docs/packages/composer.md)       |
| `@oaslananka/bridge`      | OpenAPI and schema-first MCP server generation                                  | [Bridge docs](./docs/packages/bridge.md)           |
| `@oaslananka/observatory` | Metrics, traces, anomaly detection, alerting, and dashboard UI                  | [Observatory docs](./docs/packages/observatory.md) |
| `@oaslananka/lab`         | Electron desktop workbench for connecting to and debugging MCP servers          | [Lab docs](./docs/packages/lab.md)                 |

### MCP Lab Screenshot

![MCP Lab desktop screenshot](./assets/lab.png)

## Quick Start

```bash
pnpm install --frozen-lockfile
pnpm build

# Seed and run Atlas
pnpm --filter @oaslananka/atlas exec node dist/cli.js seed --db ./data/atlas.sqlite
pnpm --filter @oaslananka/atlas exec node dist/cli.js serve --db ./data/atlas.sqlite --port 4003

# In another terminal, run Observatory
pnpm --filter @oaslananka/observatory exec node dist/cli.js serve --db ./data/observatory.sqlite --port 4006
```

Once the services are up:

- Atlas UI: [http://localhost:4003](http://localhost:4003)
- Atlas health: [http://localhost:4003/health](http://localhost:4003/health)
- Observatory UI: [http://localhost:4006](http://localhost:4006)
- Observatory health: [http://localhost:4006/health](http://localhost:4006/health)

## Architecture

`shared` carries the protocol baseline, logger factory, transports, telemetry helpers, and test fixtures used everywhere else. MCP client-facing traffic is typically wrapped by `sentinel` for policy and audit, then aggregated through `composer`, or orchestrated from `forge`. `atlas` and `observatory` are HTTP-first operator surfaces, while `lab` is the developer-facing desktop entry point.

The suite currently defaults to MCP protocol version `2025-11-25` while keeping compatibility helpers for `2025-11-05` handshakes during the 1.0 transition.

## Development

```bash
make install
make lint
make typecheck
make test
make test-coverage
make knip
```

More setup and workflow guidance lives in [docs/guide/introduction.md](./docs/guide/introduction.md), [docs/guide/installation.md](./docs/guide/installation.md), and [docs/guide/quick-start.md](./docs/guide/quick-start.md).

## Release Policy

- npm `patch`, `minor`, and `major` releases publish packages and then publish matching `server.json` metadata to the Official MCP Registry.
- Docs-only, internal-only, and CI-only changes do not publish to npm or the Official MCP Registry.
- Registry-only metadata fixes use prerelease server versions such as `1.3.4-1` while keeping the underlying package version at `1.3.4`, following the MCP Registry versioning guidance.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), use Changesets for user-visible changes, and prefer Azure pipeline parity when adding validation steps.

## Roadmap

- `@oaslananka/gateway`: HTTP-first multi-tenant MCP gateway
- `@oaslananka/sdk`: cross-language SDK surface starting with Python
- Forge visual editor built on React Flow
- Atlas federation across multiple registry instances
- Observatory exports for Grafana and OTel collector pipelines
- Sentinel policy integration with OPA

## License

Apache 2.0 — © 2025-2026 oaslananka
