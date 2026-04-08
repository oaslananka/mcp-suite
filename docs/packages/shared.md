# Shared

`@oaslananka/shared` provides the protocol/runtime foundation used across the monorepo: MCP client and server primitives, stdio and HTTP transports, auth helpers, rate limiting, telemetry, retry logic, health endpoints, and test fixtures.

## Install

```bash
npm install @oaslananka/shared
```

## Public API highlights

| Export | Purpose |
| --- | --- |
| `MCPClient` | Connect to MCP servers over pluggable transports |
| `MCPServer` | Handle MCP requests and notifications with router support |
| `StdioTransport` | Local stdio transport for CLI-native servers |
| `StreamableHTTPTransport` | HTTP transport with protocol-version headers and reconnect policy |
| `createLogger` | Shared pino logger factory honoring `LOG_LEVEL` |

## Examples

```ts
import { MCPClient, StreamableHTTPTransport } from "@oaslananka/shared";

const client = new MCPClient(
  new StreamableHTTPTransport({ url: "http://localhost:4001", reconnect: true }),
  { clientInfo: { name: "example-client", version: "1.0.0" } }
);

await client.connect();
const tools = await client.listTools();
```

## Troubleshooting

- Set `LOG_LEVEL=debug` to inspect handshake and runtime behavior.
- Use the shared mock transport and mock server test fixtures when you want fast unit tests without a real subprocess.
- Prefer the protocol helpers from `shared` instead of hardcoding MCP versions in downstream packages.
