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

## UI quality gates

Atlas, Observatory, and the Lab renderer are exercised from their production builds with Playwright Chromium. The browser suite uses deterministic mocked API and preload boundaries so failures represent UI contracts rather than external network availability.

```bash
pnpm run build
pnpm run test:ui
# Or run one project at a time:
pnpm run test:e2e
pnpm run test:a11y
pnpm run test:perf
pnpm run size
```

`test:ui` runs all three Playwright projects and writes a combined JUnit report in CI so Codecov Test Analytics can surface failed browser tests. `test:e2e` covers Atlas search/detail/submission, Observatory dashboard/traces/anomalies, and Lab connection/tool-contract flows. `test:a11y` runs axe WCAG 2.0/2.1 A and AA rules on every home surface. `test:perf` enforces local production-navigation smoke thresholds; it is not a replacement for field telemetry or Lighthouse lab scoring.

`pnpm run size` measures raw and independently gzipped production files for all publishable package `dist/` trees plus the three UI surfaces. Budgets are calibrated from the current production baseline with roughly 15–20% headroom. Budget changes require an intentional review with the measured before/after output; they must not be raised merely to make CI green.

Install the matching browser once on a new developer machine:

```bash
pnpm exec playwright install chromium
```

CI installs Chromium and its Linux system dependencies before running the browser gates. The commands themselves are cross-platform and can be run unchanged from PowerShell after the workspace build.
