## Fix Complete: Restored Node 24.18.0 Runtime Contract

### Change Made
- **`.tool-versions`**: Restored `node 24.18.0` (was incorrectly set to `22.23.3`)

### Verification Results

| Check | Status |
|-------|--------|
| Frozen install (`pnpm install --frozen-lockfile`) | ✅ Pass |
| Typecheck (`pnpm run typecheck`) | ✅ Pass |
| Lint (`pnpm run lint`) | ✅ Pass (warnings only, no errors) |
| Tests (`pnpm run test`) | ✅ Pass (235 tests across 9 packages + 4 integration tests) |
| Build (`pnpm run build`) | ✅ Pass (8 packages built) |
| Toolchain tests (`pnpm run toolchain:test`) | ✅ Pass (82 tests) |
| Toolchain contract (`pnpm run toolchain:check`) | ✅ Pass (runtime + repository) |
| Container build (Forge) | ✅ Pass |
| Security scan | ✅ Pass (pre-existing moderate vuln in sprintf-js transitive dep) |

### Security Upgrades Preserved
- Electron `41.10.6`
- electron-updater `6.8.9`
- electron-builder `26.15.3`

### Notes
- Only `.tool-versions` was modified (no lockfile or manifest changes needed)
- Pre-existing issues unchanged: pnpm-lock.yaml formatting, knip config hints, sprintf-js vulnerability (no patched version available)
- All CI-required checks pass with Node 24.18.0
