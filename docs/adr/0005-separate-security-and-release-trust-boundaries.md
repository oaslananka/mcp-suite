# ADR 0005: Separate Security and Release Trust Boundaries

## Status

Accepted

## Context

The repository handles security-sensitive MCP traffic controls and public
package distribution. A single workflow or token path that can both build code
and publish packages would make mistakes more expensive.

## Decision

Separate security scanning, release asset creation, and production publishing.

CI validates code and generated artifacts with read-oriented permissions.
Release automation creates GitHub Releases and attaches assets from a clean
checkout. npm publishing is a separate guarded workflow that publishes only
verified GitHub Release package tarballs.

## Consequences

- Production publication requires explicit environment approval.
- Release assets can be inspected before publishing to npm.
- Security scans and release preflight run before package publication.
- Workflows should use least-privilege permissions and pinned action SHAs.

## Revisit When

Revisit this decision if the repository adopts a different registry, package
attestation mechanism, or release authority model.
