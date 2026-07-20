# ADR 0002: Standardize on Node.js 24, pnpm 10, and Turborepo

## Status

Accepted

## Context

The repository is a TypeScript monorepo with publishable packages, a private
Electron app, shared build steps, and GitHub-hosted automation. It needs one
runtime and package-manager baseline for local development, CI, release assets,
and Docker images.

## Decision

Use Node.js 24 as the supported runtime baseline, pnpm 10 as the package
manager, and Turborepo as the workspace task runner.

For monorepo development and automation, `.tool-versions` is the canonical
machine-readable contract and currently selects Node.js `24.18.0` and pnpm
`10.33.0`. The private root `package.json`, CI, Azure Pipelines, release jobs,
and the devcontainer must validate against that exact contract. Publishable
packages retain the broader Node 24 engine floor for consumers.

## Consequences

- Contributors get one preferred bootstrap path: run `mise install`, then install
  with the frozen lockfile. Corepack remains available when the exact Node
  runtime is already active.
- Native modules are installed and smoke-tested under the canonical Node ABI.
- CI can cache and execute workspace tasks consistently.
- New package scripts should compose through existing root scripts unless a
  focused package command is clearer.
- Node-dependent GitHub Actions must run on the current supported JavaScript
  runtime and avoid deprecated action runtimes.

## Revisit When

Revisit this decision when Node.js 24 exits active support, pnpm introduces a
breaking workspace model, or the monorepo stops sharing task orchestration.
