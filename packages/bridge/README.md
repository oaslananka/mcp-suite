# @oaslananka/bridge

Generate MCP servers from OpenAPI-style API descriptions.

## Install

```bash
npm install -g @oaslananka/bridge
```

## Quick Start

```bash
bridge validate openapi ./petstore.yaml
bridge generate openapi ./petstore.yaml --output ./generated/petstore --name petstore
```

## Example

```bash
bridge generate openapi ./openapi/internal-api.yaml \
  --output ./generated/internal-api \
  --name internal-api
```

## Core Features

- OpenAPI parsing and schema normalization
- JSON Schema generation
- MCP server code generation
- starter package metadata and README generation

## Works Well With

Generated servers can be published into `@oaslananka/atlas` and then aggregated through `@oaslananka/composer` for multi-service tool surfaces.
