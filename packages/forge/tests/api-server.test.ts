import { afterEach, describe, expect, it, vi } from "vitest";
import { RunStore } from "../src/runtime/RunStore.js";
import { ApiServer } from "../src/server/ApiServer.js";

interface TestServerFixture {
  baseUrl: string;
  server: ApiServer;
  store: RunStore;
  request: (path: string, options?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

async function createTestServer(): Promise<TestServerFixture> {
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
    await server.close();
    store.close();
    throw new Error("Expected server to listen on a TCP port");
  }

  const port = address.port;
  if (port <= 0 || port > 65535) {
    await server.close();
    store.close();
    throw new Error(`Invalid port: ${port}`);
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  const allowedPaths = new Set([
    "/health",
    "/api/pipelines",
    "/api/pipelines/deploy",
    "/api/pipelines/missing",
    "/api/pipelines/deploy/run",
    "/api/pipelines/missing/run",
    "/api/runs",
    "/api/runs/missing",
  ]);

  function validatePath(path: string): void {
    const url = new URL(path, baseUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== String(port)) {
      throw new Error("Request hostname/port mismatch");
    }
    if (!allowedPaths.has(url.pathname)) {
      throw new Error(`Path not allowed in test fixture: ${url.pathname}`);
    }
  }

  const request = async (path: string, options?: RequestInit): Promise<Response> => {
    validatePath(path);
    const url = new URL(path, baseUrl);
    return fetch(url.toString(), {
      ...options,
      redirect: "manual",
    });
  };

  const close = async (): Promise<void> => {
    await server.close();
    store.close();
  };

  return { baseUrl, server, store, request, close };
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

async function createRateLimitedServer(max: number): Promise<TestServerFixture> {
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
    rateLimit: { windowMs: 60_000, max },
  });
  await server.listen(0);

  const address = (
    server as unknown as { server?: { address: () => { port: number } | string | null } }
  ).server?.address();
  if (!address || typeof address === "string") {
    await server.close();
    store.close();
    throw new Error("Expected server to listen on a TCP port");
  }

  const port = address.port;
  if (port <= 0 || port > 65535) {
    await server.close();
    store.close();
    throw new Error(`Invalid port: ${port}`);
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  const allowedPaths = new Set([
    "/health",
    "/api/pipelines",
    "/api/pipelines/deploy",
    "/api/pipelines/missing",
    "/api/pipelines/deploy/run",
    "/api/pipelines/missing/run",
    "/api/runs",
    "/api/runs/missing",
  ]);

  function validatePath(path: string): void {
    const url = new URL(path, baseUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== String(port)) {
      throw new Error("Request hostname/port mismatch");
    }
    if (!allowedPaths.has(url.pathname)) {
      throw new Error(`Path not allowed in test fixture: ${url.pathname}`);
    }
  }

  const request = async (path: string, options?: RequestInit): Promise<Response> => {
    validatePath(path);
    const url = new URL(path, baseUrl);
    return fetch(url.toString(), {
      ...options,
      redirect: "manual",
    });
  };

  const close = async (): Promise<void> => {
    await server.close();
    store.close();
  };

  return { baseUrl, server, store, request, close };
}

describe("ApiServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists pipelines and runs the stored configuration", async () => {
    const fixture = await createTestServer();
    try {
      const health = await fixture.request("/health").then((response) => response.json());
      const pipeline = {
        name: "deploy",
        version: "1.0.0",
        steps: [{ id: "announce", type: "log", message: "Deploying" }],
      };
      const saved = await fixture
        .request("/api/pipelines", {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(pipeline),
        })
        .then((response) => response.json());
      const pipelines = await fixture
        .request("/api/pipelines", { headers: AUTH_HEADERS })
        .then((response) => response.json());
      const pipelineDetail = await fixture
        .request("/api/pipelines/deploy", {
          headers: AUTH_HEADERS,
        })
        .then((response) => response.json());
      const triggerRun = await fixture
        .request("/api/pipelines/deploy/run", {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ vars: { region: "eu-west-1" } }),
        })
        .then((response) => response.json());
      const missingRun = await fixture.request("/api/pipelines/missing/run", {
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
    } finally {
      await fixture.close();
    }
  });

  it("serves run history endpoints", async () => {
    const fixture = await createTestServer();
    try {
      const runs = await fixture
        .request("/api/runs?pipelineId=deploy&limit=5", {
          headers: AUTH_HEADERS,
        })
        .then((response) => response.json());
      const response = await fixture.request("/api/runs/missing", { headers: AUTH_HEADERS });
      const payload = await response.json();

      expect(runs.runs).toEqual([]);
      expect(response.status).toBe(404);
      expect(payload).toEqual({ error: "Not found" });
    } finally {
      await fixture.close();
    }
  });

  it("rejects unauthorized, disallowed-origin, malformed, and oversized API requests", async () => {
    const fixture = await createTestServer();
    try {
      const unauthorized = await fixture.request("/api/pipelines");
      const disallowedOrigin = await fixture.request("/api/pipelines", {
        headers: {
          authorization: "Bearer test-token",
          origin: "https://evil.example",
        },
      });
      const malformed = await fixture.request("/api/pipelines", {
        method: "POST",
        headers: jsonHeaders(),
        body: "{",
      });
      const oversized = await fixture.request("/api/pipelines", {
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
    } finally {
      await fixture.close();
    }
  });

  it("prunes stale rate-limit entries before recording new requests", async () => {
    const fixture = await createTestServer();
    try {
      const requestLog = (fixture.server as unknown as { requestLog: Map<string, number[]> })
        .requestLog;
      requestLog.set("stale-client", [0]);

      const response = await fixture.request("/api/pipelines", { headers: AUTH_HEADERS });

      expect(response.status).toBe(200);
      expect(requestLog.has("stale-client")).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it("health endpoint is accessible and unthrottled by rate limiter", async () => {
    const fixture = await createTestServer();
    try {
      const requestLog = (fixture.server as unknown as { requestLog: Map<string, number[]> })
        .requestLog;

      for (let i = 0; i < 10; i++) {
        const response = await fixture.request("/health");
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload).toEqual({ status: "ok" });
      }

      expect(requestLog.size).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it("rate limits API endpoints based on IP and authorization header", async () => {
    const fixture = await createRateLimitedServer(3);
    try {
      for (let i = 0; i < 3; i++) {
        const response = await fixture.request("/api/pipelines", { headers: AUTH_HEADERS });
        expect(response.status).toBe(200);
      }

      const rateLimited = await fixture.request("/api/pipelines", { headers: AUTH_HEADERS });
      expect(rateLimited.status).toBe(429);
      const error = await rateLimited.json();
      expect(error).toEqual({ error: "Rate limit exceeded" });

      const requestLogLimited = (fixture.server as unknown as { requestLog: Map<string, number[]> })
        .requestLog;
      expect(requestLogLimited.size).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  });

  it("rate limits requests and returns 429 when limit exceeded", async () => {
    const fixture = await createRateLimitedServer(2);
    try {
      for (let i = 0; i < 2; i++) {
        const response = await fixture.request("/api/pipelines", { headers: AUTH_HEADERS });
        expect(response.status).toBe(200);
      }

      const rateLimited = await fixture.request("/api/pipelines", { headers: AUTH_HEADERS });
      expect(rateLimited.status).toBe(429);
      const error = await rateLimited.json();
      expect(error).toEqual({ error: "Rate limit exceeded" });
    } finally {
      await fixture.close();
    }
  });
});
