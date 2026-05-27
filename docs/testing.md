# Testing

The repository uses Vitest for package and integration tests.

## Commands

```bash
pnpm run test
pnpm run test:coverage
pnpm run test:integration
pnpm run test:e2e
pnpm run test:a11y
pnpm run test:perf
pnpm run size
```

Focused package tests can be run with:

```bash
pnpm --filter @oaslananka/forge exec vitest run tests/api-server.test.ts
```

The workspace test task depends on upstream package builds through `turbo.json`, so a clean checkout can resolve workspace package exports without committing generated `dist/` files.

## UI Quality Gates

Atlas, Observatory, and Lab browser gates run against built assets with mocked API and desktop preload boundaries. Build first so the static smoke server can serve the current production bundles:

```bash
pnpm run build
pnpm run test:e2e
pnpm run test:a11y
pnpm run test:perf
pnpm run size
```

Windows 11 PowerShell equivalent:

```powershell
pnpm run build
pnpm run test:e2e
pnpm run test:a11y
pnpm run test:perf
pnpm run size
```

The E2E gate covers Atlas search/detail/submission, Observatory dashboard/traces/anomalies, and Lab connection/tool-contract flows. The accessibility gate runs axe WCAG 2.0/2.1 A and AA checks on each home surface. The performance gate records navigation timing smoke thresholds for each built surface. The size gate enforces raw and gzip budgets for UI bundles and publishable package `dist/` outputs.

## Security Regression Coverage

Security-sensitive tests cover:

- Sentinel bearer-token fail-closed behavior and explicit wildcard tool access.
- Forge HTTP URL policy blocks for metadata, loopback, RFC1918, localhost, IPv6 local/ULA, and redirect-to-private targets.
- Forge API auth, CORS, JSON body limits, malformed JSON, and persisted pipeline execution.
- Atlas and Observatory static UI containment using `path.relative()`.
- Atlas submission auth/schema/body limits and health-check SSRF defenses.
- MCP Lab stdio command allowlist and Windows spawn behavior without shell command lines.
