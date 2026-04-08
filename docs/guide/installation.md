# Installation

## Prerequisites

- Node.js `>= 20`
- pnpm `>= 10`
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
pnpm install --frozen-lockfile
pnpm build
```

## Full stack with Docker

```bash
docker compose up -d
```

Use `docker-compose.prod.yml` when you want the production-oriented composition instead of the developer default.
