# Release

MCP Suite uses release-please manifest mode. Release automation owns version bumps, changelogs, component tags, and GitHub Releases. The repository root remains private and is not an npm package; the seven `@oaslananka/*` workspaces are the public npm release surface.

## Files

- `release-please-config.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`
- `.github/workflows/release.yml`
- `.github/workflows/publish.yml`
- `scripts/release-preflight.mjs`
- `scripts/release-state.mjs`
- `scripts/pack-npm-artifacts.mjs`
- `scripts/verify-npm-artifacts.mjs`
- `scripts/publish-npm-artifacts.mjs`
- `scripts/smoke-npm-packages.mjs`

## Rules

- Do not create manual release tags or GitHub Releases.
- Do not edit package versions by hand.
- Do not publish from a local machine or a self-hosted runner.
- Do not publish files built during the production publish job.
- Do not upload SBOM, checksum, or GitHub attestation files to npm.
- Do not use a permanent npm automation token after trusted publishing is configured.

## Validation

```bash
pnpm run release:dry-run
node scripts/release-state.mjs --json
```

Release assets are built in GitHub Actions from a clean checkout when release-please creates a release. The release workflow:

1. installs with lifecycle scripts disabled, then explicitly rebuilds approved native dependencies;
2. builds every publishable package;
3. creates npm tarballs and an SPDX SBOM;
4. verifies tarball checksums, package metadata, internal dependency versions, built entrypoints, and CLI shebangs;
5. installs all tarballs in a clean temporary project and runs each CLI with `--help`;
6. creates `npm-release-manifest.json` with the immutable SHA-256, SHA-1, and SRI digest for every tarball;
7. creates GitHub artifact attestations; and
8. uploads the tarballs, manifest, SBOM, and `SHA256SUMS.txt` to every component release created by the run.

## Production Publishing

Production npm publishing is a separate guarded workflow:

- It is manually dispatched without a version input.
- It requires the `npm-production` GitHub Environment.
- It requires the `APPROVE_RELEASE=publish` confirmation input.
- It runs on a GitHub-hosted `ubuntu-24.04` runner with `id-token: write`.
- It downloads only assets from the latest GitHub Release.
- It verifies SHA-256 checksums and GitHub attestations before publishing.
- It rebuilds the npm release manifest from the downloaded tarballs and compares it with the signed release manifest.
- It runs a clean tarball installation and CLI smoke test before registry mutation.
- It publishes `@oaslananka/shared` before packages that depend on it.
- It verifies every published version against the local tarball integrity.
- It performs a clean registry installation, CLI smoke test, and `npm audit signatures` after publication.

The default authentication mode is `oidc`. npm trusted publishing automatically creates npm provenance for public packages published from this public repository, so the normal OIDC path does not pass `--provenance` or expose a registry token.

## One-Time npm Bootstrap

npm requires a package to exist before a trusted publisher can be attached to it. The first publication of each package therefore needs a tightly controlled bootstrap operation:

1. Create or verify the `oaslananka` npm organization/scope and grant the maintainer permission to create public packages.
2. Require two-factor authentication on the npm account.
3. Create a short-lived granular npm token limited to the required packages or scope, with bypass-2FA enabled only for this bootstrap.
4. Store it temporarily as the `NPM_BOOTSTRAP_TOKEN` secret on the protected `npm-production` GitHub Environment.
5. Dispatch `publish.yml` with `APPROVE_RELEASE=publish` and `authentication=bootstrap`.
6. For each published package, configure the npm trusted publisher with these exact values:
   - GitHub owner: `oaslananka`
   - Repository: `mcp-suite`
   - Workflow filename: `publish.yml`
   - Environment: `npm-production`
   - Allowed action: `npm publish`
7. Change each package publishing setting to require 2FA and disallow tokens.
8. Delete the GitHub secret and revoke the bootstrap token.
9. Use `authentication=oidc` for every later publication.

The bootstrap path still uses GitHub OIDC to generate npm provenance, verifies all release artifacts, and is resumable. It is not a permanent token-based publishing mode.

## Partial Publication Recovery

npm versions are immutable. A failed run may publish some packages before another package fails. Rerun the same guarded workflow rather than changing versions manually:

- Existing versions with the exact expected SRI or SHA-1 digest are skipped.
- Missing versions are published in dependency order.
- An existing version with different contents fails closed and requires a new release version.
- Registry errors or release-manifest drift block the run.
- Post-publication smoke and signature verification always run against the complete expected package set.

`release-state.mjs` reports `ready`, `partial-publication`, `published`, or `blocked`, together with `already_published`, `pending_publication`, and actionable blockers.

## Trusted Publisher Maintenance

Trusted publisher configuration is package-specific and case-sensitive. Keep the workflow filename and environment name synchronized with npm package settings. Trusted publishing requires npm CLI 11.5.1 or newer and Node.js 22.14.0 or newer; this repository pins Node.js 24 and validates the npm CLI before publication.

After trusted publishing is verified, do not restore `NPM_TOKEN`. Registry reads, clean installs, and signature verification are anonymous because all released packages are public.
