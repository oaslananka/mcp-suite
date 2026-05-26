# Architecture Decision Records

This directory records durable decisions that shape the monorepo. Each ADR
captures the context, decision, consequences, and revisit trigger for one
architectural choice.

## Accepted Decisions

| ADR                                                              | Decision                                                    | Status   |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](./0001-use-release-please-manifest-mode.md)               | Use release-please manifest mode for package releases       | Accepted |
| [0002](./0002-standardize-on-node-24-pnpm-turborepo.md)          | Standardize on Node.js 24, pnpm 10, and Turborepo           | Accepted |
| [0003](./0003-preserve-package-boundaries.md)                    | Preserve publishable package boundaries around MCP surfaces | Accepted |
| [0004](./0004-version-mcp-protocol-compatibility.md)             | Version MCP protocol compatibility explicitly               | Accepted |
| [0005](./0005-separate-security-and-release-trust-boundaries.md) | Separate security, release, and publish trust boundaries    | Accepted |

## Adding an ADR

1. Copy the structure from an accepted ADR.
2. Use the next four-digit number.
3. Link the ADR from this index in the same pull request.
4. Include validation evidence when the decision changes CI, release, security,
   or generated artifacts.
