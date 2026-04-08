# @oaslananka/observatory

Metrics, traces, anomaly detection, alerting, and dashboards for MCP workloads.

## Install

```bash
npm install -g @oaslananka/observatory
```

## Quick Start

```bash
observatory serve --port 4006
observatory metrics latency --minutes 60
observatory baseline latency --days 7
```

## Example

```bash
curl http://127.0.0.1:4006/api/dashboard
curl http://127.0.0.1:4006/api/anomalies
```

## Core Features

- SQLite-backed metric and span storage
- anomaly detection and baseline computation
- alert channel management
- OTLP ingestion-ready observability API

## Works Well With

Observatory pairs especially well with `@oaslananka/forge` for pipeline-level telemetry and `@oaslananka/sentinel` when you want approval and denial events surfaced as operational signals.
