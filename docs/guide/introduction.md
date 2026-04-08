# Introduction

`mcp-suite` is a production-oriented monorepo for operating Model Context Protocol systems, not just building a single MCP server. It packages the surrounding infrastructure teams usually end up writing themselves: shared protocol/runtime primitives, secure proxying, backend aggregation, workflow orchestration, registry discovery, observability, and a desktop debugging surface.

The suite is organized around a clear dependency rule: `@oaslananka/shared` sits at the base, and every other package builds upward from that foundation. This keeps protocol support, logging, retries, telemetry, and transports aligned across the workspace.

## Design goals

- Azure-first delivery with Azure DevOps Pipelines as the primary CI/CD path
- Public npm publishing under the `@oaslananka` scope
- Strict TypeScript, pnpm workspaces, Turborepo, and Changesets
- MCP compatibility centered on `2025-11-25` with `2025-11-05` fallback during the 1.0 rollout
- Small, composable packages instead of a single monolith

## When to use each package

- Use `shared` when you need MCP client/server runtime pieces, transports, auth helpers, retry logic, telemetry, or test fixtures.
- Use `sentinel` when you need to place a trust boundary in front of upstream servers.
- Use `composer` when a single client should see many MCP backends as one namespaced surface.
- Use `forge` when you need pipelines, scheduling, or tool-call orchestration.
- Use `atlas` when you need searchable server discovery and submission workflows.
- Use `bridge` when you want to generate MCP surfaces from existing API descriptions.
- Use `observatory` when you need metrics, traces, anomaly feeds, and operator dashboards.
- Use `lab` when contributors need a desktop interface for connecting, calling tools, and reviewing history.
