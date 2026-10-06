## Summary

Fixed the Codacy SSRF finding in `packages/forge/tests/api-server.test.ts:73` (round 4 remediation).

### Changes Made

**File: `packages/forge/tests/api-server.test.ts`**

Fixed both `createTestServer` and `createRateLimitedServer` test fixtures to eliminate the "user-controlled URLs passed directly to HTTP client libraries" finding:

1. **Added explicit relative-path validation** - `validatePath` now checks `path.startsWith("/")` before any URL parsing
2. **Returns validated path** - `validatePath` returns the safe `pathname + search + hash` instead of `void`
3. **Safe URL construction** - The `request` function now builds the final URL via string concatenation (`${baseUrl}${validatedPath}`) rather than passing user input to `new URL()` then `fetch()`

### Before (flagged by Codacy)

```typescript
const request = async (path: string, options?: RequestInit): Promise<Response> => {
  validatePath(path);
  const url = new URL(path, baseUrl);  // User input to URL constructor
  return fetch(url.toString(), {...});
};
```

### After (resolves finding)

```typescript
function validatePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("Path must be a relative path starting with /");
  }
  const url = new URL(path, baseUrl);
  // ... hostname/port/pathname validation
  return url.pathname + url.search + url.hash;
}

const request = async (path: string, options?: RequestInit): Promise<Response> => {
  const validatedPath = validatePath(path);
  const url = `${baseUrl}${validatedPath}`;  // Safe string concatenation
  return fetch(url, {...});
};
```

### Verification

- ✅ `pnpm run lint` — 0 errors (23 pre-existing warnings)
- ✅ `pnpm run typecheck` — passes
- ✅ `pnpm run build` — passes
- ✅ `pnpm run test` — 61/61 tests pass in forge package
- ✅ `prettier --check` — test file formatted correctly
