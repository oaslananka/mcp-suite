# MCP Metadata And Transport Policy

The repository metadata targets MCP specification `2025-11-25`.

## Metadata Validation

```bash
pnpm run validate:registry
pnpm run validate:smithery
```

`mcp.json`, package `server.json`, and Smithery metadata must stay synchronized with package identity and supported transports.

## HTTP Transport Security

Remote or public HTTP MCP surfaces must require authentication before mutation or tool execution, configure explicit allowed origins, and avoid exposing dangerous tools by default. OAuth and protected-resource metadata should only be published when the implementation is complete and tested.

## Stdio Transport Security

Stdio transports must preserve JSON-RPC framing, bound parser behavior, and redaction. Desktop stdio launch paths must use executable plus argument arrays, not shell command strings.

## Streamable HTTP

The suite's client transport implements the MCP `2025-11-25` Streamable HTTP contract through the official TypeScript SDK v1 transport. The configured URL is the single MCP endpoint for POST, GET/SSE, and optional DELETE operations. Session identifiers use `MCP-Session-Id`; negotiated versions use `MCP-Protocol-Version`.

Legacy HTTP+SSE support is deprecated and requires `compatibilityMode: "legacy-http-sse"`. There is no automatic fallback because silent fallback can hide deployment and authentication mistakes.

The July 2026 draft removes protocol-level sessions and introduces additional HTTP headers. Those changes remain behind a future, explicit protocol compatibility layer; this release continues to advertise and enforce `2025-11-25`.
