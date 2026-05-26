# ADR 0004: Version MCP Protocol Compatibility Explicitly

## Status

Accepted

## Context

MCP clients and servers can roll forward at different times. The suite needs a
new default protocol version while still accepting compatible legacy peers
during transition windows.

## Decision

Default to MCP protocol version `2025-11-25` and keep compatibility helpers for
`2025-11-05` handshakes.

Protocol constants and negotiation helpers belong in `@oaslananka/shared`.
Package code should call shared helpers instead of hardcoding supported
protocol-version strings.

## Consequences

- Compatibility behavior is testable in one shared package.
- Packages can share a common default without duplicating version literals.
- Removing a legacy protocol version requires a shared-package change, tests,
  release notes, and migration guidance.

## Revisit When

Revisit this decision when the MCP specification publishes a new stable protocol
version or when the legacy compatibility window is intentionally closed.
