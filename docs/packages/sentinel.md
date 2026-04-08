# Sentinel

`@oaslananka/sentinel` is the zero-trust proxy for MCP traffic. It sits between clients and upstream servers, applies request and response policy, redacts PII, supports approvals, and writes audit records.

## Install

```bash
npm install -g @oaslananka/sentinel
```

## Key options

| Option | Meaning |
| --- | --- |
| `--db` | SQLite path for audit logs and virtual keys |
| `--upstream-url` | HTTP upstream MCP endpoint |
| `--upstream-command` | stdio upstream launch command |

## Examples

```bash
sentinel proxy --upstream-command "npx -y @modelcontextprotocol/server-filesystem ." --db ./data/sentinel.sqlite
sentinel keys create --name ci-bot --rpm 60 --db ./data/sentinel.sqlite
sentinel pii-scan --file ./sample.txt --redact
```

## Troubleshooting

- Provide exactly one upstream mode: `--upstream-url` or `--upstream-command`.
- Use the PII scan command to validate redaction patterns before placing the proxy in front of a production server.
- If approvals or policy checks appear inconsistent, inspect the audit log first; it captures the normalized request path.
