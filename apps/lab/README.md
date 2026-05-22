# @oaslananka/lab

Electron workbench for connecting to, testing, and debugging MCP servers.

## Install

```bash
pnpm --filter @oaslananka/lab install
```

## Quick Start

```bash
pnpm --filter @oaslananka/lab dev
```

## Example

```bash
pnpm --filter @oaslananka/lab dev
pnpm --filter @oaslananka/lab exec electron-builder --dir
```

## Core Features

- saved MCP connections
- tool call explorer and JSON editor
- response history and replay
- local SQLite-backed debugging state

## Works Well With

MCP Lab is the quickest way to inspect servers from `@oaslananka/composer`, validate policy behavior in `@oaslananka/sentinel`, and manually exercise flows before codifying them in `@oaslananka/forge`.
