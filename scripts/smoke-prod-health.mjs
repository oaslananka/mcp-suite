import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import Database from "better-sqlite3";

const externalChecks = [
  process.env.FORGE_HEALTH_URL ? { name: "forge", url: process.env.FORGE_HEALTH_URL } : null,
  process.env.ATLAS_HEALTH_URL ? { name: "atlas", url: process.env.ATLAS_HEALTH_URL } : null,
  process.env.OBSERVATORY_HEALTH_URL
    ? { name: "observatory", url: process.env.OBSERVATORY_HEALTH_URL }
    : null,
  process.env.SENTINEL_HEALTH_URL
    ? { name: "sentinel", url: process.env.SENTINEL_HEALTH_URL }
    : null,
].filter(Boolean);

if (externalChecks.length > 0) {
  await runChecks(externalChecks);
} else {
  await runSelfContainedSmoke();
}

async function runSelfContainedSmoke() {
  requireBuiltArtifact("packages/forge/dist/index.js");
  requireBuiltArtifact("packages/atlas/dist/index.js");
  requireBuiltArtifact("packages/observatory/dist/index.js");

  const [
    { ApiServer, ForgeEngine, RunStore },
    { RegistryServer, ServerStore },
    { DashboardServer, SQLiteStore },
  ] = await Promise.all([
    import("../packages/forge/dist/index.js"),
    import("../packages/atlas/dist/index.js"),
    import("../packages/observatory/dist/index.js"),
  ]);

  const cleanups = [];
  try {
    const forgePort = await getAvailablePort();
    const forgeEngine = new ForgeEngine({ dbPath: ":memory:" });
    const forgeStore = new RunStore(":memory:");
    const forgeServer = new ApiServer(forgeEngine, forgeStore, {
      allowedOrigins: ["http://127.0.0.1"],
      authToken: "smoke-token",
    });
    await forgeEngine.start();
    await forgeServer.listen(forgePort);
    cleanups.push(async () => {
      await forgeServer.close();
      await forgeEngine.stop();
      forgeStore.close();
    });

    const atlasServer = new RegistryServer(new ServerStore(new Database(":memory:")), {
      submissionToken: "smoke-token",
    });
    const atlasPort = await atlasServer.listen(0);
    cleanups.push(() => atlasServer.close());

    const observatoryDb = new Database(":memory:");
    const observatoryStore = new SQLiteStore(observatoryDb);
    const observatoryServer = new DashboardServer(observatoryStore);
    const observatoryPort = await observatoryServer.listen(0);
    cleanups.push(async () => {
      await observatoryServer.close();
      observatoryDb.close();
    });

    await runChecks([
      { name: "forge", url: `http://127.0.0.1:${forgePort}/health` },
      { name: "atlas", url: `http://127.0.0.1:${atlasPort}/health` },
      { name: "observatory", url: `http://127.0.0.1:${observatoryPort}/health` },
    ]);
  } finally {
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
  }
}

async function runChecks(checks) {
  for (const check of checks) {
    const response = await fetch(check.url, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(
        `Health check failed for ${check.name}: ${response.status} ${response.statusText}`
      );
    }

    const payload = await response.json();
    if (payload.status !== "ok") {
      throw new Error(
        `Health check returned non-ok payload for ${check.name}: ${JSON.stringify(payload)}`
      );
    }
  }

  console.log(
    `Production smoke checks passed for ${checks.map((check) => check.name).join(", ")}.`
  );
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("Failed to reserve an ephemeral port");
  }

  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

function requireBuiltArtifact(relativePath) {
  const artifactPath = path.resolve(process.cwd(), relativePath);
  if (!existsSync(artifactPath)) {
    throw new Error(
      `Missing production build artifact: ${relativePath}. Run pnpm run build first.`
    );
  }
}
