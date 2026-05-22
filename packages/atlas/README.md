# @oaslananka/atlas

Registry and installation workflow for discovering, scoring, and validating MCP servers.

## Install

```bash
npm install -g @oaslananka/atlas
```

## Quick Start

```bash
atlas seed
atlas serve --port 4003
atlas search github --verified
```

## Example

```bash
curl http://127.0.0.1:4003/api/servers?q=github
curl http://127.0.0.1:4003/api/trending
```

## Core Features

- searchable MCP server catalog
- seed data for known servers
- HTTP registry API
- install and verification helpers
- uptime and health tracking

## Works Well With

Atlas complements `@oaslananka/bridge` for generated servers and `@oaslananka/forge` for pipelines that need discovery before execution.
