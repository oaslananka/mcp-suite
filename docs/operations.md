# Operations

## Recommended Repository Settings

Default branch protection should require pull requests, required status checks, at least one approving review, conversation resolution, linear history, no force pushes, and no branch deletion. Release tags matching `v*` and component release tags should be protected from deletion or rewriting.

Protected `main` required check-run names:

| Required check-run name              | Source workflow / job                         |
| ------------------------------------ | --------------------------------------------- |
| Format, Lint, Typecheck, Test, Build | CI / quality                                  |
| Docker Smoke                         | CI / docker-smoke                             |
| Analyze JavaScript and TypeScript    | CodeQL / analyze                              |
| Review Thread Gate                   | Review Thread Gate / review-thread            |
| actionlint, zizmor, gitleaks         | Workflow Lint And Secret Scan / workflow-lint |

Release preflight runs inside the CI quality job, so it is covered by `Format, Lint, Typecheck, Test, Build`.

Enable auto-delete for merged branches. Keep admin bypass limited to documented break-glass use.

## Secrets and Environments

Use GitHub Environment secrets or the configured secret provider integration. Production publish workflows should require environment approval.

Expected environment names:

- `npm-production`

Expected secret names are tied to their matching surface only. Do not reuse package-registry tokens for MCP Registry, Cloudflare, or marketplace publication.

## Docker

Dockerfiles and compose files target Node.js 24 LTS. Production compose health checks exercise `/health` only and do not require mutation API credentials.
