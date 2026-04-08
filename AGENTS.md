# AGENTS.md

## Package Selection Guide

| Task | Package |
| --- | --- |
| Aggregate multiple MCP servers behind one endpoint | `@oaslananka/composer` |
| Enforce policy, approvals, and audit logging | `@oaslananka/sentinel` |
| Discover and catalogue MCP servers | `@oaslananka/atlas` |
| Build MCP-native pipelines and orchestration flows | `@oaslananka/forge` |
| Generate MCP servers from API descriptions | `@oaslananka/bridge` |
| Inspect traces, metrics, and anomalies | `@oaslananka/observatory` |
| Use the desktop workbench for interactive debugging | `@oaslananka/lab` |
| Reuse shared protocol, transport, and test primitives | `@oaslananka/shared` |

## Bootstrap

```bash
pnpm install --frozen-lockfile
pnpm build
```

## Core Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm docs:api
pnpm smoke:prod
```

## Working Notes

- Publishable workspaces live under `packages/`.
- `apps/lab` stays private and ships as Electron release artifacts rather than npm packages.
- Use `pnpm --filter <workspace-name> <command>` to focus on one workspace at a time.
