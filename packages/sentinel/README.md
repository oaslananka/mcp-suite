# @oaslananka/sentinel

Zero-trust MCP proxy with key management, policy enforcement, audit logging, approval gates, and PII controls.

## Install

```bash
npm install -g @oaslananka/sentinel
```

## Quick Start

```bash
sentinel keys create --name local-dev --allow-tool "*"
sentinel pii-scan "Contact me at ops@example.com" --redact
sentinel proxy --upstream-url http://localhost:3000/mcp
```

## Example

```bash
sentinel proxy \
  --upstream-url http://127.0.0.1:4010/mcp \
  --db ./data/sentinel.sqlite \
  --policy ./examples/sentinel-policy.yaml
```

## Core Features

- virtual key lifecycle and rotation
- request and response pipelines
- audit trail export
- approval hold workflow
- PII detection and redaction including TR-specific patterns

## Works Well With

Sentinel is most effective in front of `@oaslananka/composer` or `@oaslananka/forge`, where one policy layer can protect many downstream MCP tools and pipeline runs.
