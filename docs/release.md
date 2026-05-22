# Release

MCP Suite uses release-please manifest mode. Release automation owns version bumps, changelogs, tags, and GitHub releases.

## Files

- `release-please-config.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`
- `.github/workflows/release.yml`
- `scripts/release-preflight.mjs`
- `scripts/release-state.mjs`

## Rules

- Do not create manual release tags.
- Do not create manual GitHub releases.
- Do not edit package versions by hand for release.
- Do not publish from a local machine.
- Do not upload SBOM, checksum, or provenance files to package registries.

## Validation

```bash
pnpm run release:dry-run
node scripts/release-state.mjs --json
```

Release assets are built in GitHub Actions from a clean checkout when release automation reports a created release. The release workflow builds packages, creates npm tarballs, generates an SPDX SBOM and SHA256 checksums, creates artifact attestations, and attaches those assets to the GitHub Release.

## Publishing

Production npm publishing is a separate guarded workflow:

- It is manually dispatched without a version input.
- It requires the `npm-production` GitHub Environment.
- It requires the `APPROVE_RELEASE` confirmation input.
- It runs `scripts/release-state.mjs` and stops unless `safe_to_publish` is true.
- It publishes only `.tgz` package assets downloaded from the GitHub Release.
