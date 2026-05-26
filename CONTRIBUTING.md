# Contributing to MCP Infrastructure Suite

Thank you for contributing! Here are the guidelines to ensure code quality and consistency across the monorepo.

## Code of Conduct

We expect all community members to act respectfully and inclusively.
Governance, triage, stale, support, and maintainer response policies live in
[docs/governance.md](./docs/governance.md).

## Development Setup

1. **Install tools:** Requires Node.js >= 24, pnpm 10.33.0, and Docker for container smoke checks.
2. **Install deps:** `pnpm install --frozen-lockfile`
3. **Build all:** `pnpm run build`
4. **Test all:** `pnpm run test`
5. **Format:** `pnpm run format`

## PR Process

1. Fork the repo and create a branch from `main`.
2. Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
3. Create tests for your features. **Core logic must be >80% covered**.
4. Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run security`, and `pnpm run release:dry-run` before submitting.
5. Create a descriptive PR outlining the problem and your solution.
6. Do not publish packages, containers, marketplace artifacts, or registry metadata from a PR.

## Architecture Rules

- Use `zod` for external data validation.
- Use `pino` for logging (no `console.log` in libraries).
- Explicit return types for async functions.
- Circular dependencies between packages are strictly forbidden.
- Always implement Graceful Shutdown handlers for SIGINT/SIGTERM.
- Release automation uses release-please manifest mode; do not hand-edit release versions, tags, or changelog entries.
