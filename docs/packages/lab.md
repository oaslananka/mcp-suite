# Lab

`@oaslananka/lab` is the desktop workbench for contributors and operators who want to connect to MCP servers, inspect tools, call them interactively, and review history from a secure Electron shell.

## Install

```bash
pnpm --filter @oaslananka/lab install
pnpm --filter @oaslananka/lab dev
```

## Key capabilities

| Capability | Purpose |
| --- | --- |
| Typed IPC channels | Keeps main, preload, and renderer contracts aligned |
| Auto-update hooks | Reports update availability to the renderer |
| Deep-link handling | Opens server/workbench flows from `mcp-lab://` links |
| Multi-platform build config | Windows, macOS, and Linux targets |

## Examples

```bash
pnpm --filter @oaslananka/lab dev
pnpm --filter @oaslananka/lab build
pnpm --filter @oaslananka/lab exec electron-builder --linux
```

## Troubleshooting

- Renderer code should only use the preload surface, never direct `ipcRenderer` access.
- Keep IPC channel names centralized in `src/main/ipc/channels.ts`.
- Test deep-link and update flows on packaged builds, not only in development mode.
