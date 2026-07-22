# Operations

## Tool Ownership

The repository uses one primary gate per concern so overlapping scanners do not create duplicate findings or unnecessary merge latency.

| Concern                     | Primary control                                           | Repository policy                                                                     |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Dependency updates          | Renovate                                                  | Dependabot alerts remain useful; duplicate Dependabot version-update PRs stay off     |
| SAST                        | CodeQL                                                    | Third-party SAST bots are advisory unless a dedicated rule is intentionally added     |
| Secret prevention           | GitHub push protection                                    | Gitleaks remains the deterministic workflow/diff backstop                             |
| Container vulnerabilities   | Trivy                                                     | Fixable `HIGH`/`CRITICAL` findings block container validation                         |
| Coverage and test analytics | Required LCOV patch gate and Codecov                      | Deterministic merge gate; Codecov remains project/test analytics                      |
| Code quality                | ESLint, TypeScript, and SonarQube Cloud                   | Native checks block; Sonar manages new-code quality and technical debt                |
| Workflow security           | actionlint and zizmor                                     | Gitleaks runs in the same workflow-security job                                       |
| Merge automation            | GitHub ruleset and native auto-merge                      | Squash-only; external merge orchestration is not installed                            |
| Release automation          | release-please                                            | Independent component versions and tags                                               |
| OCI supply chain            | SHA pinning, OIDC, Cosign, and GitHub attestations        | No long-lived signing or registry credentials                                         |
| npm supply chain            | release-please, OIDC trusted publishing, and attestations | One-time bootstrap token only; checksums, clean installs, and signatures are verified |

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
| SonarCloud Code Analysis             | SonarQube Cloud                               |

Container validation remains visible on every pull request but is not duplicated as six separate required ruleset entries. Each matrix entry now includes a blocking Trivy gate for fixable `HIGH`/`CRITICAL` vulnerabilities and, for trusted pull requests, a categorized SARIF upload that retains unfixed findings in GitHub Code Scanning. Release preflight runs inside the CI quality job, so it is covered by `Format, Lint, Typecheck, Test, Build`. UI E2E, accessibility, performance-smoke, and package/bundle-size gates run in the same required quality job after production builds are created.

The `Containers` workflow is the only authority allowed to publish GHCR images. It first publishes a full-commit SHA tag, verifies the Cosign OIDC identity, pushes and verifies a GitHub provenance attestation, confirms both supported architectures, and runs production Compose against the published images with `--no-build`. The `main`, `latest`, and component version aliases are created only after these checks pass.

The required quality job enforces workspace coverage thresholds and an 80% changed-line LCOV gate before any external upload. Codecov remains the project-coverage, changed-line visualization, bundle-analysis, and failed-test analytics service, but its asynchronous status is not a protected-branch dependency. SonarQube Cloud remains the maintainability, reliability, duplication, and security-hotspot gate. Keep admin bypass disabled except for a documented emergency ruleset change.

## Secrets and Environments

Use GitHub Environment secrets or the configured secret provider integration. Production publish workflows should require environment approval. Codecov uploads use GitHub OIDC and do not require a long-lived repository token; fork pull requests use the public tokenless path.

Expected environment names:

- `npm-production`

The npm environment should require manual approval and is the exact environment recorded in each package's npm trusted-publisher configuration. Normal publication uses GitHub OIDC and has no npm token secret. `NPM_BOOTSTRAP_TOKEN` is allowed only for the first package creation, must be a short-lived granular token, and must be deleted and revoked immediately after all seven trusted publishers are configured. `NPM_TOKEN` is not a supported repository secret.

Expected secret names are tied to their matching surface only. Do not reuse package-registry tokens for MCP Registry, Cloudflare, or marketplace publication.

## Docker

Dockerfiles and compose files target Node.js 24 LTS. Production compose health checks exercise `/health` only and do not require mutation API credentials.

Container image names, digest update rules, GHCR tags, and SBOM/provenance
verification commands live in [containers.md](./containers.md).
