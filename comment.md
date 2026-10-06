## Summary

Fixed all three Guardian source findings in PR #62 (round 3):

### 1. Transformer.ts - ReDoS Fix (`packages/forge/src/engine/Transformer.ts:16-60`)
- **Issue**: Regex `/\{\{((?:[^}]|\}(?!}))*)\}\}/g` had super-linear backtracking on repeated unmatched `{{`
- **Fix**: Replaced with forward-only delimiter scanner that finds the next `}}` then the last `{{` before it, advancing past each match. Eliminates quadratic rescanning; demonstrates linear time by design.

### 2. engine.test.ts - Parameterized Tests + Regressions (`packages/forge/tests/engine.test.ts`)
- **Issue**: 3 duplicate tests for single-brace handling (Sonar warning)
- **Fix**: Combined into single `it.each` table with 4 cases. Added regression tests:
  - `handles repeated unmatched opening delimiters without backtracking`
  - `handles large template with many unmatched opening pairs linearly` (500 pairs, <500ms)

### 3. api-server.test.ts - Constrained Fixture Helper (`packages/forge/tests/api-server.test.ts`)
- **Issue**: Codacy flagged user-controlled URLs passed to `fetch` (test fixture base URL)
- **Fix**: Replaced `withServer` callback with `createTestServer`/`createRateLimitedServer` fixtures that:
  - Validate port range (1-65535)
  - Restrict requests to enumerated allowlisted paths only
  - Verify hostname/port match test server (`127.0.0.1`)
  - Disable redirects (`redirect: "manual"`)
  - Preserve all real API checks (auth, rate-limit, CORS, malformed-body, size-limit)

### Verification
All pipeline checks pass:
- ✅ `pnpm run format:check`
- ✅ `pnpm run lint` (only pre-existing warnings)
- ✅ `pnpm run typecheck`
- ✅ `pnpm run test` (200+ tests across all packages)
- ✅ `pnpm run build`

**Note**: Dependency audit (100 findings) and container vulnerability gates remain separate blockers per diagnosis — not addressed in this bounded repair.
