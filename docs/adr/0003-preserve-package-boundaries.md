# ADR 0003: Preserve Publishable Package Boundaries

## Status

Accepted

## Context

The suite has several MCP-facing surfaces with different responsibilities:
shared protocol/runtime primitives, orchestration, policy enforcement,
discovery, aggregation, API bridging, observability, and the desktop workbench.
Mixing those responsibilities would make releases and security review harder.

## Decision

Keep publishable packages under `packages/` and keep the Electron workbench under
`apps/lab`.

`@oaslananka/shared` owns reusable protocol, transport, auth, retry, telemetry,
logging, and test primitives. Package-specific behavior stays in the package
that exposes it.

## Consequences

- Shared code changes require broader tests because they affect every package.
- Package-specific features can release independently through manifest mode.
- The package selection guide in `AGENTS.md` remains the routing map for agent
  and maintainer work.
- New cross-cutting utilities should start in a package only when reuse is real,
  not speculative.

## Revisit When

Revisit this decision if a surface becomes large enough for its own repository
or if a package boundary repeatedly forces duplicated implementation.
