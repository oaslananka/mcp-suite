# Development

MCP Suite is a pnpm-managed TypeScript monorepo. Publishable packages live in `packages/`, and the private Electron workbench lives in `apps/lab`.

## Bootstrap

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
```

Node.js 24 LTS is the production, CI, and Docker runtime target. Node 26 can be used for compatibility checks after it becomes part of project policy, but it is not the blocking production target here.

## Local Gates

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run security
pnpm run build
pnpm run release:dry-run
```

`pnpm run ci` combines the local gates used by CI. It does not hide failures.

## Generated API Docs

Run TypeDoc before changing exported TypeScript APIs:

```bash
pnpm docs:api
```

The generated `docs/api/` tree is ignored by git. The Docs workflow regenerates
it in CI and uploads the verified output as an `api-docs-<commit-sha>` workflow
artifact. See [docs/api-reference.md](./api-reference.md) for local and CI
validation commands.

## Package Boundaries

Use `pnpm --filter <workspace-name> <command>` for focused work. Shared protocol, transport, URL policy, testing, and logging helpers belong in `@oaslananka/shared`; package-specific API or UI behavior belongs in its package.
