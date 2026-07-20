# Node 24 Toolchain Standardization Design

## Goal

Make every active local, CI, Azure Pipeline, release, and devcontainer path use one auditable monorepo toolchain contract: Node.js `24.18.0` and pnpm `10.33.0`.

## Decision

`.tool-versions` is the canonical machine-readable source for the monorepo development toolchain. Publishable packages retain their public `node >=24` compatibility declaration, while the private root workspace enforces the exact development line through `packageManager`, strict root engines, and a dependency-free validation script.

GitHub Actions and Azure Pipelines must read or verify the canonical file rather than silently maintaining unrelated version floors. The devcontainer uses Node 24 and derives the pnpm activation version from `.tool-versions`; startup validation rejects a patch-level mismatch.

## Components

- `.tool-versions`: canonical Node and pnpm versions.
- `scripts/toolchain-contract.mjs`: dependency-free parser and validation functions.
- `scripts/verify-toolchain.mjs`: CLI for repository/runtime checks and diagnostics.
- `scripts/verify-native-modules.mjs`: post-install smoke check for `better-sqlite3` and Node ABI compatibility.
- CI/Azure/devcontainer changes: select, print, and verify the contract before running quality gates.
- Development documentation: clean bootstrap and stale native-module recovery.

## Validation Flow

1. Before dependency installation, verify the running Node and pnpm versions.
2. Validate that active configuration files do not reference Node 20 or Node 22 and that root metadata matches `.tool-versions`.
3. Install with the frozen lockfile under the selected runtime.
4. Load `better-sqlite3`, create an in-memory database, and run a query to prove native ABI compatibility.
5. Run the existing quality and release gates.

## Error Handling

Validation errors identify the mismatched file, field, actual value, and expected value. Native-module failures include the running Node version and ABI and instruct contributors to delete installed modules and reinstall under the canonical runtime.

## Non-goals

- Narrowing the supported runtime of published packages below Node 24.
- Upgrading pnpm, Node, Electron, or `better-sqlite3` beyond the versions already selected by issue #34.
- Redesigning Azure-to-GitHub mirroring; that remains issue #41.
