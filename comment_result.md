## Summary

Applied the diagnosed root-cause repair to PR #62 (round 4 remediation) for oaslananka/mcp-suite.

### Changes Made

#### 1. Markdown Formatting (3 files)
- **AGENTS.md**: Added trailing newline (Prettier formatting)
- **comment.md**: Formatted with proper spacing after headers and list items
- **reply.md**: Formatted with proper spacing after headers, code blocks, and added trailing newline

#### 2. pnpm Dependency Graph Updates (package.json, pnpm-lock.yaml)
Updated overrides to address all vulnerable dependencies in published packages:
- `@xmldom/xmldom`: ^0.8.13 → ^0.8.15
- `brace-expansion`: ^5.0.7 → ^5.0.9 (fixes CVE-2026-14257 and new DoS)
- `ip-address`: ^10.1.1 → ^10.3.1
- `js-yaml`: ^4.2.0 → ^4.3.1
- `qs`: ^6.15.2 → ^6.16.0
- Added new overrides for: `hono` (^4.13.7), `fast-uri` (^3.1.5), `fast-copy` (^4.1.0), `proxy-addr` (^2.0.8), `markdown-it` (^14.3.1), `nanoid` (^3.3.18), `app-builder-lib` (^26.15.0), `builder-util-runtime` (^9.7.0), `baseline-browser-mapping` (^2.11.0), `smol-toml` (^1.9.0), `undici` (^6.28.1), `react-router` (^6.30.6)
- Updated devDependencies: vitest (^4.1.11), @vitest/coverage-v8 (^4.1.11), knip (^5.88.1), lint-staged (^16.4.0), rimraf (^6.1.3), typedoc (^0.28.18), typedoc-plugin-markdown (^4.11.0)

**Result**: All published packages (`packages/*`) now have zero vulnerabilities. Remaining findings are only in the private `apps/lab` Electron app.

#### 3. Alpine OpenSSL Refresh (6 Dockerfiles)
Added `openssl` to `apk add` in the runtime stage of all six service Dockerfiles:
- `packages/atlas/Dockerfile`
- `packages/bridge/Dockerfile`
- `packages/composer/Dockerfile`
- `packages/forge/Dockerfile`
- `packages/observatory/Dockerfile`
- `packages/sentinel/Dockerfile`

### Verification
All pipeline checks pass:
- ✅ `pnpm run format:check`
- ✅ `pnpm run lint` (0 errors, pre-existing warnings only)
- ✅ `pnpm run typecheck`
- ✅ `pnpm run test` (200+ tests across all packages + 4 integration tests)
- ✅ `pnpm run build`

### Files Modified
- AGENTS.md
- comment.md
- reply.md
- package.json
- pnpm-lock.yaml
- packages/atlas/Dockerfile
- packages/bridge/Dockerfile
- packages/composer/Dockerfile
- packages/forge/Dockerfile
- packages/observatory/Dockerfile
- packages/sentinel/Dockerfile