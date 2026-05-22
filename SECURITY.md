# Security Policy

## Supported Versions

The latest published minor release line is supported with security fixes.

The supported runtime for maintained releases is Node.js 24 LTS.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities.

Send details to `security@mcp-suite.dev` with:

- affected package and version
- reproduction steps
- impact assessment
- any suggested remediation

We will acknowledge receipt as quickly as possible and coordinate a fix and disclosure timeline.

## Security Boundaries

- Remote mutation APIs require bearer authentication and explicit allowed origins.
- Workflow HTTP egress blocks private, loopback, link-local, metadata, ULA, multicast, and unspecified targets.
- Desktop stdio launch uses an executable allowlist and argument arrays.
- Secrets must be provided through GitHub Environments or the documented secret provider integration and must never be committed.
