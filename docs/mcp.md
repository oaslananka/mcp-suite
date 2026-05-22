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
