# Atlas

`@oaslananka/atlas` is the registry and discovery surface for MCP servers. It ships an HTTP API, a searchable Vite + React catalog UI, trending and tag views, and submission workflows backed by SQLite.

## Install

```bash
npm install -g @oaslananka/atlas
```

## HTTP API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/servers` | Search and filter the catalog |
| `GET /api/servers/:id` | Return a single server record |
| `GET /api/tags` | List known tags |
| `GET /api/trending` | Return top-ranked records |
| `POST /api/submissions` | Accept a new server submission |
| `GET /health` | Health probe |

## Examples

```bash
atlas seed --db ./data/atlas.sqlite
atlas serve --db ./data/atlas.sqlite --port 4003
atlas search github --verified
```

## Troubleshooting

- Seed the catalog before opening the UI if you want meaningful search and trending results on first launch.
- If the UI renders a blank page, rebuild the package so `dist/ui` is present.
- `homepage` is used for link and health metadata; prefer it over package-specific source fields.
