# Packages

The suite is intentionally split into small packages so teams can adopt only the layer they need.

| Package | Primary role | Transport / surface |
| --- | --- | --- |
| `@oaslananka/shared` | MCP runtime primitives | library |
| `@oaslananka/forge` | orchestration engine | HTTP API + CLI |
| `@oaslananka/sentinel` | security proxy | stdio |
| `@oaslananka/atlas` | registry and catalog | HTTP API + UI |
| `@oaslananka/composer` | backend aggregation | stdio |
| `@oaslananka/bridge` | server generation | CLI |
| `@oaslananka/observatory` | observability and alerts | HTTP API + UI |
| `@oaslananka/lab` | desktop workbench | Electron |

Start with `shared` for runtime building blocks, then compose the control-plane packages that match your deployment model.
