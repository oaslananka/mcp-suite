import { afterEach, describe, expect, it, vi } from "vitest";
import { RunStore } from "../src/runtime/RunStore.js";
import { ApiServer } from "../src/server/ApiServer.js";

async function withServer<T>(fn: (baseUrl: string, server: ApiServer) => Promise<T>): Promise<T> {
  const engine = {
    run: vi.fn().mockImplementation(async (pipeline, vars) => ({
      id: "run-1",
      pipelineId: pipeline.name,
      status: "success",
      vars,
    })),
  };
  const store = new RunStore(":memory:");
  const server = new ApiServer(engine as never, store, {
    allowedOrigins: ["https://forge.example.com"],
    authToken: "test-token",
    jsonBodyLimit: "128b",
    rateLimit: { windowMs: 60_000, max: 50 },
  });
  await server.listen(0);

  const address = (
    server as unknown as { server?: { address: () => { port: number } | string | null } }
  ).server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on a TCP port");
  }

  try {
    return await fn(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await server.close();
    store.close();
  }
}

const AUTH_HEADERS = {
  authorization: "Bearer test-token",
  origin: "https://forge.example.com",
};

function jsonHeaders(): Record<string, string> {
  return {
    ...AUTH_HEADERS,
    "content-type": "application/json",
  };
}

describe("ApiServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists pipelines and runs the stored configuration", async () => {
    await withServer(async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
      const pipeline = {
        name: "deploy",
        version: "1.0.0",
        steps: [{ id: "announce", type: "log", message: "Deploying" }],
      };
      const saved = await fetch(`${baseUrl}/api/pipelines`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(pipeline),
      }).then((response) => response.json());
      const pipelines = await fetch(`${baseUrl}/api/pipelines`, { headers: AUTH_HEADERS }).then(
        (response) => response.json()
      );
      const pipelineDetail = await fetch(`${baseUrl}/api/pipelines/deploy`, {
        headers: AUTH_HEADERS,
      }).then((response) => response.json());
      const triggerRun = await fetch(`${baseUrl}/api/pipelines/deploy/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ vars: { region: "eu-west-1" } }),
      }).then((response) => response.json());
      const missingRun = await fetch(`${baseUrl}/api/pipelines/missing/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ vars: {} }),
      });

      expect(health).toEqual({ status: "ok" });
      expect(saved.pipeline).toMatchObject({ name: "deploy", steps: [{ id: "announce" }] });
      expect(pipelines.pipelines).toEqual([expect.objectContaining({ name: "deploy" })]);
      expect(pipelineDetail.pipeline).toMatchObject({ name: "deploy", version: "1.0.0" });
      expect(triggerRun).toMatchObject({
        pipelineId: "deploy",
        status: "success",
        vars: { region: "eu-west-1" },
      });
      expect(missingRun.status).toBe(404);
    });
  });

  it("serves run history endpoints", async () => {
    await withServer(async (baseUrl) => {
      const runs = await fetch(`${baseUrl}/api/runs?pipelineId=deploy&limit=5`, {
        headers: AUTH_HEADERS,
      }).then((response) => response.json());
      const response = await fetch(`${baseUrl}/api/runs/missing`, { headers: AUTH_HEADERS });
      const payload = await response.json();

      expect(runs.runs).toEqual([]);
      expect(response.status).toBe(404);
      expect(payload).toEqual({ error: "Not found" });
    });
  });

  it("rejects unauthorized, disallowed-origin, malformed, and oversized API requests", async () => {
    await withServer(async (baseUrl) => {
      const unauthorized = await fetch(`${baseUrl}/api/pipelines`);
      const disallowedOrigin = await fetch(`${baseUrl}/api/pipelines`, {
        headers: {
          authorization: "Bearer test-token",
          origin: "https://evil.example",
        },
      });
      const malformed = await fetch(`${baseUrl}/api/pipelines`, {
        method: "POST",
        headers: jsonHeaders(),
        body: "{",
      });
      const oversized = await fetch(`${baseUrl}/api/pipelines`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: "oversized",
          version: "1.0.0",
          steps: [{ id: "announce", type: "log", message: "x".repeat(200) }],
        }),
      });

      expect(unauthorized.status).toBe(401);
      expect(disallowedOrigin.status).toBe(403);
      expect(malformed.status).toBe(400);
      expect(oversized.status).toBe(413);
    });
  });

  it("prunes stale rate-limit entries before recording new requests", async () => {
    await withServer(async (baseUrl, server) => {
      const requestLog = (server as unknown as { requestLog: Map<string, number[]> }).requestLog;
      requestLog.set("stale-client", [0]);

      const response = await fetch(`${baseUrl}/api/pipelines`, { headers: AUTH_HEADERS });

      expect(response.status).toBe(200);
      expect(requestLog.has("stale-client")).toBe(false);
    });
  });
});
