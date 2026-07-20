export function verifySqliteModule(Database) {
  const database = new Database(":memory:");

  try {
    const result = database.prepare("SELECT 1 AS value").get();
    if (result?.value !== 1) {
      throw new Error("better-sqlite3 smoke query returned an unexpected result");
    }
    return result;
  } finally {
    database.close();
  }
}

export function formatNativeModuleFailure(error, runtime = {}) {
  const detail = error instanceof Error ? error.message : String(error);
  const nodeVersion = String(runtime.nodeVersion ?? process.version).replace(/^v/, "");
  const abi = String(runtime.abi ?? process.versions.modules);

  return [
    `Native module ABI check failed: node=${nodeVersion} abi=${abi}`,
    detail,
    "Remove node_modules and reinstall under the canonical runtime:",
    "  pnpm run clean",
    "  mise install",
    "  mise exec -- pnpm install --frozen-lockfile",
  ].join("\n");
}
