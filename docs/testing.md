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

## Coverage and Codecov

`pnpm run test:coverage` generates V8 coverage for every workspace and the integration suite. Vitest writes LCOV reports below each workspace `coverage/` directory and JUnit XML below each `test-results/` directory. The repository helper below prints the exact reports available in the current checkout:

```bash
node scripts/codecov-reports.mjs
```

The Codecov GitHub App must be installed for `oaslananka/mcp-suite` before the first upload so Codecov can publish pull-request checks and annotations. The Ubuntu `Format, Lint, Typecheck, Test, Build` job is the single canonical Codecov uploader. It uses the full-SHA-pinned Codecov Action v7 for both coverage and `test_results` uploads. Upload steps use `if: ${{ !cancelled() }}`, so valid JUnit output produced before a test failure is still reported to Codecov Test Analytics; empty or malformed partial reports are ignored.

Trusted same-repository runs authenticate with GitHub OIDC. Public fork pull requests fall back to Codecov's tokenless public-repository flow; contributors do not need access to a `CODECOV_TOKEN`. The repository-level policy in `codecov.yml` enforces project and patch targets relative to the base report with a 1% threshold and exposes stable components for all seven packages plus Lab.

SonarQube Cloud remains responsible for maintainability, reliability, duplication, and security-hotspot review. Codecov is the dedicated coverage and failed-test analytics gate, avoiding two independent coverage policies.

Atlas and Observatory use the Codecov Vite plugin for bundle analysis. The plugin is disabled in local builds and fork builds; trusted GitHub CI enables it with `CODECOV_BUNDLE_ANALYSIS=true` and uploads the stable bundle names `mcp-suite-atlas-ui` and `mcp-suite-observatory-ui` through OIDC.

## Security Regression Coverage

Security-sensitive tests cover:

- Sentinel bearer-token fail-closed behavior and explicit wildcard tool access.
- Forge HTTP URL policy blocks for metadata, loopback, RFC1918, localhost, IPv6 local/ULA, and redirect-to-private targets.
- Forge API auth, CORS, JSON body limits, malformed JSON, and persisted pipeline execution.
- Atlas and Observatory static UI containment using `path.relative()`.
- Atlas submission auth/schema/body limits and health-check SSRF defenses.
- MCP Lab stdio command allowlist and Windows spawn behavior without shell command lines.
