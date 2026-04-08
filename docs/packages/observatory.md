# Observatory

`@oaslananka/observatory` provides the operator feedback loop: metrics, traces, alert records, anomaly detection, and a Vite + React dashboard for monitoring MCP systems.

## Install

```bash
npm install -g @oaslananka/observatory
```

## HTTP API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dashboard` | Dashboard rollup for cards and charts |
| `GET /api/metrics` | Metric time-series query |
| `GET /api/traces` | Recent traces |
| `GET /api/anomalies` | Detected anomaly feed |
| `GET /api/alerts` | Alert feed |
| `GET /health` | Health probe |

## Examples

```bash
observatory serve --db ./data/observatory.sqlite --port 4006
observatory metrics latency --minutes 60
observatory baseline latency --days 7
```

## Troubleshooting

- Rebuild the package if the dashboard UI is missing from `dist/ui`.
- Metrics and alerts live in SQLite; use a persistent volume when running the service in containers.
- If anomaly volume looks noisy, adjust the baseline logic before tuning the UI.
