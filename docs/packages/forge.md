# Forge

`@oaslananka/forge` is the orchestration layer. It executes pipeline definitions, persists run state, exposes an HTTP API, and is designed to coordinate MCP tool calls alongside HTTP and control-flow steps.

## Install

```bash
npm install -g @oaslananka/forge
```

## Key options

| Option | Meaning |
| --- | --- |
| `--port` | HTTP API port for the runtime server |
| `--db` | SQLite path used for run metadata |
| `--vars.<key>=<value>` | Pipeline runtime variables |

## Examples

```bash
forge serve --port 4002
forge validate ./pipeline.yml
forge run ./pipeline.yml --vars.team=platform
```

## Troubleshooting

- If a pipeline appears to hang, enable debug logging and inspect retries or loop conditions in the run store.
- Keep custom nodes pure and explicit about side effects so dry-run and retry behavior remain predictable.
- When testing nodes, prefer fixture pipelines plus direct engine tests instead of only end-to-end API checks.
