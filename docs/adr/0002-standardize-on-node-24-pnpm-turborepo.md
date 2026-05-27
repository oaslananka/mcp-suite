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

The root `package.json` declares the runtime and package-manager floor. CI and
release workflows must use the same major versions.

## Consequences

- Contributors get one bootstrap path: enable Corepack, activate pnpm 10, and
  install with the frozen lockfile.
- CI can cache and execute workspace tasks consistently.
- New package scripts should compose through existing root scripts unless a
  focused package command is clearer.
- Node-dependent GitHub Actions must run on the current supported JavaScript
  runtime and avoid deprecated action runtimes.

## Revisit When

Revisit this decision when Node.js 24 exits active support, pnpm introduces a
breaking workspace model, or the monorepo stops sharing task orchestration.
