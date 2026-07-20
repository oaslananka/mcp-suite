# @oaslananka/shared

Shared protocol, transport, auth, retry, telemetry, and health primitives for the MCP Infrastructure Suite.

## Install

```bash
npm install @oaslananka/shared
```

## Quick Start

```ts
import { withRetry, logger } from "@oaslananka/shared";

await withRetry(async () => {
  logger.info("hello from shared");
});
```

## Example

```ts
import { MCPClient, StreamableHTTPTransport } from "@oaslananka/shared";

const client = new MCPClient(new StreamableHTTPTransport({ url: "http://127.0.0.1:4003/mcp" }), {
  clientInfo: { name: "catalog-check", version: "1.0.0" },
});

await client.connect();
const tools = await client.listTools();
await client.disconnect();
console.log(tools.tools.map((tool) => tool.name));
```

## Streamable HTTP compatibility

`StreamableHTTPTransport` defaults to the MCP `2025-11-25` Streamable HTTP contract and delegates wire behavior to the official MCP TypeScript SDK:

- one configured MCP endpoint handles POST requests, GET/SSE streams, and optional DELETE session termination
- servers may establish sessions with `MCP-Session-Id`; the client returns that value on subsequent requests
- the negotiated `MCP-Protocol-Version` is sent after initialization
- reconnect and SSE resumption use the official SDK implementation
- disconnect sends DELETE when the server established a session; set `terminateSessionOnClose: false` only when an operator intentionally owns session lifecycle elsewhere

The deprecated HTTP+SSE transport is never selected implicitly. Existing deployments must opt in explicitly:

```ts
const legacy = new StreamableHTTPTransport({
  url: "https://legacy.example.com/",
  compatibilityMode: "legacy-http-sse",
  legacySseUrl: "https://legacy.example.com/sse",
});
```

The announced July 2026 stateless protocol changes are tracked separately and do not silently alter the `2025-11-25` runtime contract. A future protocol version must be enabled through an explicit compatibility release.

## Included Modules

- MCP client and server primitives
- stdio and streamable HTTP transports
- retry and timeout helpers
- API key middleware, rate limiting, and health endpoints
- telemetry helpers for spans and metrics

## Works Well With

Use `@oaslananka/shared` as the foundation for every other workspace in the suite, especially `@oaslananka/forge` for orchestration and `@oaslananka/sentinel` for transport-aware proxying.
