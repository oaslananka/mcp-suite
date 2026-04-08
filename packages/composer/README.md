# @oaslananka/composer

Aggregate multiple MCP backends into a single namespaced proxy endpoint.

## Install

```bash
npm install -g @oaslananka/composer
```

## Quick Start

```yaml
servers:
  github:
    transport: http
    url: http://localhost:3001/mcp
```

```bash
composer serve --config ./composer.yml
composer list-tools --config ./composer.yml
```

## Example

```yaml
servers:
  atlas:
    transport: http
    url: http://127.0.0.1:4003/mcp
  observatory:
    transport: http
    url: http://127.0.0.1:4006/mcp
```

## Core Features

- backend connection management
- namespaced tool routing
- conflict handling across multiple servers
- reconnect-friendly operational model

## Works Well With

Composer is the natural upstream for `@oaslananka/sentinel` and the default aggregation layer for `@oaslananka/forge` pipelines.
