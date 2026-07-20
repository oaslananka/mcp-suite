# @oaslananka/bridge

Generate MCP servers from OpenAPI-style API descriptions.

## Install

```bash
npm install -g @oaslananka/bridge
```

## Quick Start

```bash
bridge validate openapi ./petstore.yaml
bridge generate openapi ./petstore.yaml --output ./generated/petstore --name petstore
```

## Example

```bash
bridge generate openapi ./openapi/internal-api.yaml \
  --output ./generated/internal-api \
  --name internal-api
```

## Core Features

- OpenAPI parsing and schema normalization
- JSON Schema generation
- MCP server code generation
- starter package metadata and README generation

## Works Well With

Generated servers can be published into `@oaslananka/atlas` and then aggregated through `@oaslananka/composer` for multi-service tool surfaces.

## Remote Schema Security

Remote OpenAPI inputs use the shared hardened fetch policy:

- HTTPS is required by default.
- URL credentials, localhost, loopback, private, link-local, multicast, documentation, benchmark, and other special-use IPv4/IPv6 ranges are rejected.
- DNS answers are validated and the reviewed address is pinned into the connection to prevent DNS rebinding between validation and connect.
- Every redirect is revalidated; redirects are capped at three.
- Connection and response-read timeouts are enforced for the complete request.
- Responses are limited to 1 MB and must use an OpenAPI JSON or YAML content type.
- Sensitive headers are stripped across origins, and request bodies are not forwarded by cross-origin 307/308 redirects.

Private-network schemas are disabled unless the exact hostname or IP literal is explicitly trusted:

```bash
bridge validate openapi https://schemas.corp.example/openapi.yaml \
  --trusted-private-host schemas.corp.example
```

For non-interactive environments, set a comma-separated exact-host list:

```bash
BRIDGE_TRUSTED_PRIVATE_HOSTS=schemas.corp.example,fd00::10
```

Wildcards, URL strings, paths, credentials, and host-plus-port values are rejected. Trust only hosts controlled by the deployment operator; the opt-in bypasses private-address blocking for those exact names but retains HTTPS, DNS pinning, redirects, timeouts, and response limits.
