# Containers

The publishable service images are built from the package Dockerfiles and
published to GitHub Container Registry (GHCR) from the `Containers` workflow.
Pull request builds validate the same Dockerfiles for `linux/amd64` and
`linux/arm64`; only `main` and manual workflow runs publish images.

## Images

| Package                   | Image                                      |
| ------------------------- | ------------------------------------------ |
| `@oaslananka/atlas`       | `ghcr.io/oaslananka/mcp-suite-atlas`       |
| `@oaslananka/bridge`      | `ghcr.io/oaslananka/mcp-suite-bridge`      |
| `@oaslananka/composer`    | `ghcr.io/oaslananka/mcp-suite-composer`    |
| `@oaslananka/forge`       | `ghcr.io/oaslananka/mcp-suite-forge`       |
| `@oaslananka/observatory` | `ghcr.io/oaslananka/mcp-suite-observatory` |
| `@oaslananka/sentinel`    | `ghcr.io/oaslananka/mcp-suite-sentinel`    |

Default-branch builds publish `latest`, `main`, and `sha-<commit>` tags.
Consumers that need reproducibility should pin by digest after inspecting the
published manifest.

```bash
docker buildx imagetools inspect ghcr.io/oaslananka/mcp-suite-forge:main
docker pull ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest>
```

```powershell
docker buildx imagetools inspect ghcr.io/oaslananka/mcp-suite-forge:main
docker pull ghcr.io/oaslananka/mcp-suite-forge@sha256:<digest>
```

## Local Validation

Use the production compose file to validate the HTTP service images locally.

```bash
docker compose -f docker-compose.prod.yml build forge atlas observatory
docker buildx imagetools inspect docker.io/library/node:24-alpine
```

```powershell
docker compose -f docker-compose.prod.yml build forge atlas observatory
docker buildx imagetools inspect docker.io/library/node:24-alpine
```

## Base Image Updates

Dockerfiles and demo compose services pin `node:24-alpine` by OCI index digest:

```text
sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14
```

Update the digest only after inspecting the current official Node image and
confirming that the index still includes `linux/amd64` and `linux/arm64`.

```bash
docker buildx imagetools inspect docker.io/library/node:24-alpine
```

```powershell
docker buildx imagetools inspect docker.io/library/node:24-alpine
```

After changing the digest, update every package Dockerfile and the demo service
images in `docker-compose.yml`, then rerun local validation and the `Containers`
workflow.

## SBOM And Provenance

The publish job uses Docker Buildx through `docker/build-push-action` with
`sbom: true` and `provenance: mode=max`. The resulting SBOM and provenance
attestations are attached to the pushed GHCR image manifests, so verification
starts from the image digest reported by `docker buildx imagetools inspect`.
