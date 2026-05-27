# Local Playground

This is the reproducible demo path for Atlas, Observatory, and Lab until a hosted preview is available. It builds the workspace, seeds local SQLite data, and starts the UI surfaces with stable ports.

## Prepare seeded data

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm run playground:seed
```

The seed command writes:

- `data/playground/atlas.sqlite` with the built-in Atlas MCP server catalog.
- `data/playground/observatory.sqlite` with latency, call, error, trace, and alert records for the Observatory dashboard.

## Start Atlas

```bash
pnpm run playground:atlas
```

Open [http://localhost:4003](http://localhost:4003) and search for `github` or filter to verified servers. The API is available at [http://localhost:4003/api/servers](http://localhost:4003/api/servers).

## Start Observatory

In another terminal:

```bash
pnpm run playground:observatory
```

Open [http://localhost:4006](http://localhost:4006) to inspect the seeded dashboard, traces, anomalies, and alerts. The seeded API rollup is available at [http://localhost:4006/api/dashboard](http://localhost:4006/api/dashboard).

## Start Lab

In another terminal:

```bash
pnpm --filter @oaslananka/lab dev
```

Use Lab to connect to local MCP servers while Atlas and Observatory stay available as the catalog and observability surfaces for the same playground session.

## Reset the playground

Re-run the seed command whenever you want deterministic sample data again:

```bash
pnpm run playground:seed
```
