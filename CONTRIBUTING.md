# Contributing to MCP Infrastructure Suite

Thank you for contributing! Here are the guidelines to ensure code quality and consistency across the monorepo.

## Code of Conduct
We expect all community members to act respectfully and inclusively.

## Development Setup

1. **Install tools:** Requires Node.js >= 20, pnpm >= 9, Docker (for e2e/DB testing)
2. **Install deps:** `pnpm install`
3. **Build all:** `pnpm turbo run build`
4. **Test all:** `pnpm turbo run test`
5. **Format:** `pnpm run format`

## PR Process

1. Fork the repo and create a branch from `main`.
2. Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
3. Create tests for your features. **Core logic must be >80% covered**.
4. Run `make typecheck` and `make lint` before submitting.
5. Create a descriptive PR outlining the problem and your solution.

## Architecture Rules

- Use `zod` for external data validation.
- Use `pino` for logging (no `console.log` in libraries).
- Explicit return types for async functions.
- Circular dependencies between packages are strictly forbidden.
- Always implement Graceful Shutdown handlers for SIGINT/SIGTERM.
