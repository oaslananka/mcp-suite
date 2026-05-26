# ADR 0001: Use Release-Please Manifest Mode

## Status

Accepted

## Context

MCP Suite publishes multiple packages from one repository. Manual version bumps,
tags, changelogs, and release notes would be easy to desynchronize across
packages, especially when a single change touches shared primitives and package
consumers.

## Decision

Use release-please manifest mode as the source of truth for version bumps,
package changelogs, release pull requests, tags, and GitHub Releases.

Release assets are built by GitHub Actions from clean checkout state after
release automation creates or targets a release.

## Consequences

- Package changelogs stay scoped to the package that release-please updates.
- Maintainers do not hand-edit package versions or create manual tags for normal
  releases.
- Release workflows must validate manifest state before packaging or publishing.
- Docs-only, CI-only, and internal-only changes can avoid accidental npm
  publication.

## Revisit When

Revisit this decision if release-please no longer supports manifest mode for the
repository shape, or if the package set moves to independent repositories.
