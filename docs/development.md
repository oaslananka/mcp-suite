# Development

MCP Suite is a pnpm-managed TypeScript monorepo. Publishable packages live in `packages/`, and the private Electron workbench lives in `apps/lab`.

## Canonical Toolchain

The repository toolchain is declared in `.tool-versions`:

- Node.js `24.18.0`
- pnpm `10.33.0`

Published packages continue to support the documented Node 24 runtime line, but monorepo development and automation use the exact versions above so native modules and release artifacts are reproducible.

## Clean Bootstrap

With [mise](https://mise.jdx.dev/) installed:

```bash
mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run toolchain:check
mise exec -- pnpm run toolchain:check:native
```

Corepack remains a supported alternative when Node `24.18.0` is already active:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm run toolchain:check
pnpm run toolchain:check:native
```

The root `preinstall` hook rejects an unsupported Node or pnpm version before workspace installation proceeds. CI also prints the Node version, pnpm version, and Node module ABI.

## Recover from a Stale Native ABI

A `better-sqlite3` error that mentions `NODE_MODULE_VERSION`, an invalid ELF header, or a missing native binding usually means dependencies were installed under another Node runtime.

Linux and macOS:

```bash
rm -rf node_modules packages/*/node_modules apps/*/node_modules
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run toolchain:check:native
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, packages/*/node_modules, apps/*/node_modules -ErrorAction SilentlyContinue
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run toolchain:check:native
```

Do not copy `node_modules` between machines, containers, Node versions, or CPU architectures.

## Local Gates

```bash
mise exec -- pnpm run format:check
mise exec -- pnpm run lint
mise exec -- pnpm run typecheck
mise exec -- pnpm run test
mise exec -- pnpm run security
mise exec -- pnpm run build
mise exec -- pnpm run release:dry-run
```

`pnpm run ci` combines the local gates used by CI, including the toolchain contract. It does not hide failures.

## Generated API Docs

Run TypeDoc before changing exported TypeScript APIs:

```bash
pnpm docs:api
```

The generated `docs/api/` tree is ignored by git. The Docs workflow regenerates it in CI and uploads the verified output as an `api-docs-<commit-sha>` workflow artifact. See [docs/api-reference.md](./api-reference.md) for local and CI validation commands.

## Package Boundaries

Use `pnpm --filter <workspace-name> <command>` for focused work. Shared protocol, transport, URL policy, testing, and logging helpers belong in `@oaslananka/shared`; package-specific API or UI behavior belongs in its package.
