## Security Remediation Complete (Round 2)

All actionable findings from PR #63 have been addressed:

### npm Dependencies (Already Fixed)
- **hono**: Override set to `^4.13.7` in `package.json:77` → resolves to `hono@4.13.13` in lockfile
  - Fixes CVE-2026-71850 (SSR data disclosure) and CVE-2026-93981 (XSS)
- **@remix-run/router**: Override set to `1.23.3` in `package.json:66` → resolves to `1.23.3` in lockfile
  - Fixes CVE-2026-40181 (Open Redirect in react-router@6.30.4)

### Container Images (Updated)
All 6 package Dockerfiles updated to use newer `node:24.18-alpine` base image with patched Alpine/OpenSSL:
- **New base digest**: `sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3` (built 2026-07-30, Alpine 3.24)
- **Old base digest**: `sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd` (built 2026-06-24, Alpine 3.24)
- Added `openssl` to `apk add` in runtime stage for defense-in-depth

**Files changed**:
- `packages/atlas/Dockerfile`
- `packages/bridge/Dockerfile`
- `packages/composer/Dockerfile`
- `packages/forge/Dockerfile`
- `packages/observatory/Dockerfile`
- `packages/sentinel/Dockerfile`

The `pnpm-lock.yaml` already reflects the correct dependency versions; no lockfile regeneration required.