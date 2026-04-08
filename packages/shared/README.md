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

const client = new MCPClient(
  new StreamableHTTPTransport({ url: "http://127.0.0.1:4003/mcp" }),
  { clientInfo: { name: "catalog-check", version: "1.0.0" } },
);

await client.connect();
const tools = await client.listTools();
await client.disconnect();
console.log(tools.tools.map((tool) => tool.name));
```

## Included Modules

- MCP client and server primitives
- stdio and streamable HTTP transports
- retry and timeout helpers
- API key middleware, rate limiting, and health endpoints
- telemetry helpers for spans and metrics

## Works Well With

Use `@oaslananka/shared` as the foundation for every other workspace in the suite, especially `@oaslananka/forge` for orchestration and `@oaslananka/sentinel` for transport-aware proxying.
