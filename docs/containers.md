# Containers

The six publishable service images are built from the package Dockerfiles and published to GitHub Container Registry (GHCR) by the `Containers` workflow.

## Images

| Package                   | Image                                      |
| ------------------------- | ------------------------------------------ |
| `@oaslananka/atlas`       | `ghcr.io/oaslananka/mcp-suite-atlas`       |
| `@oaslananka/bridge`      | `ghcr.io/oaslananka/mcp-suite-bridge`      |
| `@oaslananka/composer`    | `ghcr.io/oaslananka/mcp-suite-composer`    |
| `@oaslananka/forge`       | `ghcr.io/oaslananka/mcp-suite-forge`       |
| `@oaslananka/observatory` | `ghcr.io/oaslananka/mcp-suite-observatory` |
| `@oaslananka/sentinel`    | `ghcr.io/oaslananka/mcp-suite-sentinel`    |

Every publication builds `linux/amd64` and `linux/arm64` with Docker Buildx. BuildKit attaches an SBOM and maximum-mode provenance to each multi-architecture image index.

## Pull Request Security Gate

Every pull request performs two container build paths for each image:

1. A `linux/amd64` image is loaded into Docker and scanned by Trivy for fixed and unfixed `HIGH` and `CRITICAL` operating-system and language-package vulnerabilities.
2. The SARIF result is uploaded to GitHub Code Scanning for trusted same-repository pull requests. A second Trivy invocation blocks only fixable `HIGH` and `CRITICAL` findings, so unfixed upstream advisories remain visible without permanently deadlocking the repository.
3. A cache-only Buildx build verifies that the Dockerfile also builds for `linux/amd64` and `linux/arm64`.

Fork pull requests still run the blocking Trivy gate, but SARIF upload is skipped because untrusted pull requests do not receive `security-events: write` access.

## Tag and Promotion Policy

Publication always starts with one immutable tag:

```text
sha-<full 40-character Git commit SHA>
```

The workflow signs, attests, verifies, and smoke-tests that immutable tag before creating any mutable alias.

Default-branch publication promotes the verified digest to:

- `main`
- `latest`

`latest` therefore means the most recent `main` digest that passed signature verification, provenance verification, architecture checks, and the published-image production smoke test. It is never written directly by the build step.

Component Release Please tags use the following prefixes:

- `atlas-v*`
- `bridge-v*`
- `composer-v*`
- `forge-v*`
- `observatory-v*`
- `sentinel-v*`

A stable tag such as `forge-v1.2.3` promotes the already verified Forge digest to `1.2.3`, `1.2`, and `1`. A prerelease such as `forge-v1.2.3-rc.1` receives only the exact `1.2.3-rc.1` alias. Other component images are still rebuilt under the immutable commit tag so the shared production Compose smoke test can run, but they do not receive the Forge version aliases.

Consumers requiring reproducibility must pin the digest or full-SHA tag:

```bash
docker buildx imagetools inspect ghcr.io/oaslananka/mcp-suite-forge:sha-<40-character-commit>
docker pull ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest>
```

## Signature and Attestation Verification

Published image indexes are signed keylessly with Cosign using the GitHub Actions OIDC identity. Verification must constrain both the workflow identity and the GitHub token issuer:

```bash
cosign verify \
  --certificate-identity "https://github.com/oaslananka/mcp-suite/.github/workflows/containers.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest>
```

For a component release, replace the identity suffix with the exact tag ref, for example `refs/tags/forge-v1.2.3`.

The workflow also creates a GitHub artifact attestation for the same digest and pushes the attestation to GHCR:

```bash
gh attestation verify \
  oci://ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest> \
  --repo oaslananka/mcp-suite \
  --bundle-from-oci \
  --signer-workflow oaslananka/mcp-suite/.github/workflows/containers.yml \
  --source-ref refs/heads/main \
  --source-digest <40-character-commit>
```

Both commands are executed inside the publication job before the digest is eligible for alias promotion.

## Architecture, SBOM, and Provenance Inspection

Inspect the OCI index and confirm that both required platforms are present:

```bash
docker buildx imagetools inspect ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest>
docker buildx imagetools inspect --raw ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest> | jq '.manifests[].platform'
```

Buildx publishes in-toto provenance and SPDX-compatible SBOM attestations alongside the image index. Signature and GitHub attestation verification establish the workflow identity; the digest identifies the exact image, SBOM, and provenance evidence used by the release.

## Published-Image Production Smoke

`docker-compose.published.yml` replaces the three HTTP service images while retaining production ports, volumes, environment variables, and health checks from `docker-compose.prod.yml`. `--no-build` guarantees that the smoke test cannot silently fall back to local Dockerfiles.

```bash
export MCP_SUITE_IMAGE_TAG=sha-<40-character-commit>

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.published.yml \
  pull forge atlas observatory
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.published.yml \
  up -d --no-build forge atlas observatory

FORGE_HEALTH_URL=http://127.0.0.1:4000/health \
ATLAS_HEALTH_URL=http://127.0.0.1:4003/health \
OBSERVATORY_HEALTH_URL=http://127.0.0.1:4006/health \
node scripts/smoke-prod-health.mjs

docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.published.yml \
  down -v --remove-orphans
```

The workflow first runs each of the six published package CLIs with `--help`, then waits for Docker health status before exercising the three HTTP endpoints. It always captures logs and removes volumes.

## Local Build and Vulnerability Scan

Use the production Compose file for local build validation:

```bash
docker compose -f docker-compose.prod.yml build forge atlas observatory
docker build -f packages/forge/Dockerfile -t local/mcp-suite-forge:scan .
trivy image --scanners vuln --pkg-types os,library --severity HIGH,CRITICAL --exit-code 1 local/mcp-suite-forge:scan
```

## Base Image Updates

Dockerfiles and demo Compose services pin the Node.js `24.18.0` `node:24-alpine` multi-architecture OCI index by digest:

```text
sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
```

Update the digest only after inspecting the current official Node image and confirming that both `linux/amd64` and `linux/arm64` configs report `NODE_VERSION=24.18.0`.

```bash
docker buildx imagetools inspect docker.io/library/node:24-alpine
```

After changing the digest, update every package Dockerfile and the demo service images in `docker-compose.yml`, then rerun local validation and the `Containers` workflow.
