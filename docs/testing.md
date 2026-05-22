# Testing

The repository uses Vitest for package and integration tests.

## Commands

```bash
pnpm run test
pnpm run test:coverage
pnpm run test:integration
```

Focused package tests can be run with:

```bash
pnpm --filter @oaslananka/forge exec vitest run tests/api-server.test.ts
```

The workspace test task depends on upstream package builds through `turbo.json`, so a clean checkout can resolve workspace package exports without committing generated `dist/` files.

## Security Regression Coverage

Security-sensitive tests cover:

- Sentinel bearer-token fail-closed behavior and explicit wildcard tool access.
- Forge HTTP URL policy blocks for metadata, loopback, RFC1918, localhost, IPv6 local/ULA, and redirect-to-private targets.
- Forge API auth, CORS, JSON body limits, malformed JSON, and persisted pipeline execution.
- Atlas and Observatory static UI containment using `path.relative()`.
- Atlas submission auth/schema/body limits and health-check SSRF defenses.
- MCP Lab stdio command allowlist and Windows spawn behavior without shell command lines.
