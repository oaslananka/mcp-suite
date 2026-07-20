# Installation

## Prerequisites

- Node.js `>= 24` for package consumers
- Node.js `24.18.0` and pnpm `10.33.0` for monorepo contributors, declared in `.tool-versions`
- Docker, optional for local stack work

## Install individual packages

```bash
# Shared runtime primitives
npm install @oaslananka/shared

# Security proxy
npm install -g @oaslananka/sentinel

# Pipeline engine
npm install -g @oaslananka/forge

# Aggregator
npm install -g @oaslananka/composer

# Registry
npm install -g @oaslananka/atlas

# Generator
npm install -g @oaslananka/bridge

# Observability dashboard
npm install -g @oaslananka/observatory
```

## Clone the monorepo

```bash
git clone https://github.com/oaslananka/mcp-suite
cd mcp-suite
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run toolchain:check:native
mise exec -- pnpm build
```

## Full stack with Docker

```bash
docker compose up -d
```

Use `docker-compose.prod.yml` when you want the production-oriented composition instead of the developer default.

Published GHCR image names and digest verification commands are documented in
[container operations](../containers.md).

Contributor bootstrap and native ABI recovery procedures are documented in [Development](../development.md).
