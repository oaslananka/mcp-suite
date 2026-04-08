# @oaslananka/bridge

## 1.0.0

### Major Changes

- d1d9e1a: Implement the productionization baseline for the MCP Infrastructure Suite.
  - recover the workspace by filling previously missing modules across sentinel, atlas, composer, observatory, bridge, and lab
  - add Azure DevOps CI/CD pipeline definitions and release helper scripts while removing GitHub Actions workflows
  - harden shared transport and utility layers with retry, telemetry, auth, rate limiting, and health helpers
  - introduce production compose, documentation scaffolding, package READMEs, and example suites
  - align package builds so the monorepo passes typecheck, lint, test, and build end to end

### Patch Changes

- Updated dependencies [d1d9e1a]
  - @oaslananka/shared@1.0.0
