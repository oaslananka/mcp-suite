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
