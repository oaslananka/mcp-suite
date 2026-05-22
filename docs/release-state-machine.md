# Release State Machine

`scripts/release-state.mjs` inspects release-managed package versions, the release-please manifest, and npm registry state for publishable packages.

State names used by the automation:

- `no-release`
- `release-pr-open`
- `release-pr-green`
- `release-pr-merged`
- `tag-created`
- `dry-run-success`
- `staging-published`
- `testpypi-published`
- `npm-test-published`
- `production-published`
- `pypi-published`
- `npm-published`
- `mcp-registry-updated`
- `docker-ghcr-published`
- `vscode-marketplace-published`
- `open-vsx-published`
- `github-release-published`
- `personal-mirror-synced`
- `post-release-smoke-success`
- `complete`
- `blocked`

If a target npm version already exists, `safe_to_publish` is false and publish workflows must stop.
