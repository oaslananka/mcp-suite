# Operations

## Recommended Repository Settings

The `main-ci-solo-maintainer` ruleset is designed for a solo maintainer: pull requests are mandatory, approving reviews are not required, review conversations must be resolved, history stays linear, and branch deletion or force-push is blocked. Only squash merge is enabled at repository level; native auto-merge remains available. A merge queue is intentionally not enabled while repository traffic is low.

Protected `main` required check-run names:

| Required check-run name              | Source workflow / integration                 |
| ------------------------------------ | --------------------------------------------- |
| Format, Lint, Typecheck, Test, Build | CI / quality                                  |
| Docker Smoke                         | CI / docker-smoke                             |
| dependency-review                    | Dependency Review                             |
| Analyze JavaScript and TypeScript    | CodeQL / analyze                              |
| Review Thread Gate                   | Review Thread Gate / review-thread            |
| actionlint, zizmor, gitleaks         | Workflow Lint And Secret Scan / workflow-lint |
| codecov/project                      | Codecov project coverage                      |
| codecov/patch                        | Codecov changed-line coverage                 |

Container validation remains visible on every pull request but is not duplicated as six separate required ruleset entries. Release preflight runs inside the CI quality job, so it is covered by `Format, Lint, Typecheck, Test, Build`.

Codecov owns coverage gating and failed-test analytics. SonarQube Cloud remains the maintainability, reliability, duplication, and security-hotspot gate. Keep admin bypass disabled except for a documented emergency ruleset change.

## Secrets and Environments

Use GitHub Environment secrets or the configured secret provider integration. Production publish workflows should require environment approval. Codecov uploads use GitHub OIDC and do not require a long-lived repository token; fork pull requests use the public tokenless path.

Expected environment names:

- `npm-production`

Expected secret names are tied to their matching surface only. Do not reuse package-registry tokens for MCP Registry, Cloudflare, or marketplace publication.

## Docker

Dockerfiles and compose files target Node.js 24 LTS. Production compose health checks exercise `/health` only and do not require mutation API credentials.

Container image names, digest update rules, GHCR tags, and SBOM/provenance
verification commands live in [containers.md](./containers.md).
