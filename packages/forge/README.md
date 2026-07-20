# @oaslananka/forge

Declarative pipeline engine for chaining MCP tools into production workflows.

## Install

```bash
npm install -g @oaslananka/forge
```

## Quick Start

```bash
forge init hello-world
forge validate hello-world.yaml
forge serve --port 4000
```

## Example

```yaml
name: nightly-catalog-sync
version: "1"
servers:
  composer:
    transport: http
    url: http://127.0.0.1:4010/mcp
steps:
  - id: list-registry
    type: tool
    server: composer
    tool: atlas__search
    input:
      q: github
```

## Core Features

- pipeline execution with persistence
- timeout, retry, branching, and loop support
- HTTP API and websocket run streaming
- transform, webhook, email, and script nodes

## Works Well With

Pair Forge with `@oaslananka/composer` to fan out across multiple backends, and add `@oaslananka/sentinel` in front of those backends when pipeline execution needs policy enforcement and audit logs.

## Authenticated real-time events

Forge exposes real-time events at `/ws`. The WebSocket handshake is fail-closed: a configured bearer principal, an allowed `Origin`, and an event scope are required. Tokens in query strings are not accepted.

```http
GET /ws HTTP/1.1
Authorization: Bearer <token>
Origin: https://forge.example.com
Upgrade: websocket
```

Subscribe only to categories authorized for the principal:

```json
{ "type": "subscribe", "categories": ["runs"] }
```

Event principals use the same scope model as the HTTP API. Useful scopes are:

- `api:read` and `api:write` for HTTP routes
- `events:subscribe` to open a real-time channel
- `events:read` for all configured event categories
- `events:runs`, `events:pipelines`, or `events:*` for category-specific access

The legacy `FORGE_API_TOKEN` is treated as one full-access principal for backwards compatibility. Applications that need separate identities or expirations should construct `ApiServer` with `authTokens`, where each token maps to an `{ id, scopes, expiresAt? }` principal. Browser WebSocket APIs cannot set an `Authorization` header, so browser deployments should connect through an authenticated same-origin backend or token-brokered WebSocket endpoint rather than placing credentials in URLs.

Connection count, per-principal count, payload size, outbound queue, subscription count, message rate, ping/pong liveness, and idle timeout are bounded. See `.env.example` for the `FORGE_WS_*` settings. Missing origins remain rejected unless `FORGE_WS_ALLOW_MISSING_ORIGIN=true` is explicitly set for a non-browser deployment.
