# @oaslananka/shared

## [1.1.0](https://github.com/oaslananka/mcp-suite/compare/shared-v1.0.1...shared-v1.1.0) (2026-07-22)


### Features

* **shared:** implement compliant Streamable HTTP transport ([5cd031e](https://github.com/oaslananka/mcp-suite/commit/5cd031ecfa36967b49919087aa19711550d7c96e))

## [1.0.1](https://github.com/oaslananka/mcp-suite/compare/shared-v1.0.0...shared-v1.0.1) (2026-05-26)

### Bug Fixes

- **security:** clear npm advisory backlog ([9625470](https://github.com/oaslananka/mcp-suite/commit/9625470da05e8796cc2eaab7beac9ceebcce224d)), closes [#5](https://github.com/oaslananka/mcp-suite/issues/5)

## 1.0.0

### Major Changes

- d1d9e1a: Implement the productionization baseline for the MCP Infrastructure Suite.
  - recover the workspace by filling previously missing modules across sentinel, atlas, composer, observatory, bridge, and lab
  - add Azure DevOps CI/CD pipeline definitions and release helper scripts while removing GitHub Actions workflows
  - harden shared transport and utility layers with retry, telemetry, auth, rate limiting, and health helpers
  - introduce production compose, documentation scaffolding, package READMEs, and example suites
  - align package builds so the monorepo passes typecheck, lint, test, and build end to end
