# Quick Start

This walkthrough brings up Atlas and Observatory locally, then shows how Sentinel and Composer fit into a typical operator workflow.

## 1. Build the workspace

```bash
pnpm install --frozen-lockfile
pnpm build
```

## 2. Seed and run Atlas

```bash
pnpm --filter @oaslananka/atlas exec node dist/cli.js seed --db ./data/atlas.sqlite
pnpm --filter @oaslananka/atlas exec node dist/cli.js serve --db ./data/atlas.sqlite --port 4003
```

Visit [http://localhost:4003](http://localhost:4003) to search the seeded catalog, filter by tags, inspect server detail pages, and submit new entries.

## 3. Run Observatory

```bash
pnpm --filter @oaslananka/observatory exec node dist/cli.js serve --db ./data/observatory.sqlite --port 4006
```

Visit [http://localhost:4006](http://localhost:4006) for dashboard, traces, anomalies, and alerts.

## 4. Wrap an upstream server with Sentinel

```bash
npx -y @oaslananka/sentinel proxy \
  --upstream-command "npx -y @modelcontextprotocol/server-filesystem ." \
  --db ./data/sentinel.sqlite
```

This starts a stdio proxy that can sit between your MCP client and the upstream server while persisting audit records and applying request or response policy.

## 5. Aggregate multiple backends with Composer

Create a `composer.yml`:

```yaml
servers:
  github:
    transport: stdio
    command: npx -y @modelcontextprotocol/server-github
  filesystem:
    transport: stdio
    command: npx -y @modelcontextprotocol/server-filesystem .
```

Then run:

```bash
npx -y @oaslananka/composer serve --config ./composer.yml
```

Your client now sees a single MCP server with namespaced tools such as `github__search_code` and `filesystem__read_file`.

## 6. Drive orchestration with Forge

```yaml
name: onboarding
version: "1"
servers: {}
steps:
  - id: announce
    type: log
    message: "hello ${vars.team}"
```

Run a pipeline:

```bash
pnpm --filter @oaslananka/forge exec node dist/cli.js run ./pipeline.yml --vars.team=platform
```
