# ADR 0005: Separate Security and Release Trust Boundaries

## Status

Accepted

## Context

The repository handles security-sensitive MCP traffic controls and public package distribution. A single workflow or credential path that can both build code and publish packages would make mistakes and supply-chain compromise more expensive. npm package versions are immutable, and a monorepo publication can fail after only part of the package set is visible.

## Decision

Separate security scanning, release asset creation, and production publishing.

CI validates code and generated artifacts with read-oriented permissions. Release automation creates GitHub Releases and attaches assets from a clean checkout. npm publishing is a separate guarded workflow that publishes only verified GitHub Release package tarballs.

The production workflow uses npm trusted publishing with GitHub Actions OIDC. It verifies release checksums, GitHub artifact attestations, package metadata, built entrypoints, internal dependency versions, and clean-install smoke tests before registry mutation. Publication is dependency-aware and idempotent: an existing immutable version is skipped only when its registry integrity matches the signed release tarball.

Because npm requires a package to exist before trusted publishing can be configured, first publication may use a short-lived, environment-protected bootstrap token. That exception is explicit, separately selected, and removed after trusted publishers are configured for all packages.

## Consequences

- Production publication requires explicit environment approval.
- Release assets can be inspected before publishing to npm.
- Security scans and release preflight run before package publication.
- Workflows use least-privilege permissions and pinned action SHAs.
- Long-lived npm publication tokens are not used after bootstrap.
- Partial publication is recovered by rerunning the same workflow; matching versions are skipped and conflicting immutable versions fail closed.
- npm provenance, GitHub attestations, SPDX SBOM, checksums, and a machine-readable release manifest provide complementary evidence.
- Post-publication validation installs packages from the public registry and verifies CLI behavior and npm signatures.

## Revisit When

Revisit this decision if npm supports trusted-publisher configuration before first publication, the repository adopts staged publishing, or a different registry or release authority becomes primary.
