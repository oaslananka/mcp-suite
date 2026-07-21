import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { RunStore } from "../src/runtime/RunStore.js";
import { ApiServer } from "../src/server/ApiServer.js";

const ALLOWED_ORIGIN = "https://forge.example.com";
const GOOD_TOKEN = "good-token";
const ADMIN_TOKEN = "admin-token";
const UNDER_SCOPED_TOKEN = "under-scoped-token";
const EXPIRED_TOKEN = "expired-token";
const QUEUE_TOKEN = "queue-token";

type JsonMessage = Record<string, unknown>;

interface StartedServer {
  baseUrl: string;
  server: ApiServer;
  store: RunStore;
}

async function startServer(overrides: Record<string, unknown> = {}): Promise<StartedServer> {
  const engine = { run: vi.fn() };
  const store = new RunStore(":memory:");
  const server = new ApiServer(engine as never, store, {
    allowedOrigins: [ALLOWED_ORIGIN],
    authTokens: {
      [GOOD_TOKEN]: {
        id: "operator",
        scopes: ["api:read", "events:subscribe", "events:runs"],
      },
      [ADMIN_TOKEN]: {
        id: "administrator",
        scopes: ["api:*", "events:*"],
      },
      [UNDER_SCOPED_TOKEN]: {
        id: "reader",
        scopes: ["api:read"],
      },
      [EXPIRED_TOKEN]: {
        id: "expired-operator",
        scopes: ["events:runs"],
        expiresAt: Date.now() - 1_000,
      },
      [QUEUE_TOKEN]: {
        id: "queue-operator",
        scopes: ["events:subscribe", "events:runs"],
      },
    },
    webSocket: {
      allowedCategories: ["runs", "pipelines"],
      allowMissingOrigin: false,
      idleTimeoutMs: 2_000,
      maxConnections: 3,
      maxConnectionsPerPrincipal: 1,
      maxPayloadBytes: 256,
      maxQueueBytes: 512,
      maxSubscriptions: 1,
      messageRateLimit: { max: 3, windowMs: 60_000 },
      path: "/ws",
      pingIntervalMs: 100,
      ...(overrides["webSocket"] as Record<string, unknown> | undefined),
    },
    ...overrides,
  } as never);
  await server.listen(0);

  const address = (
    server as unknown as { server?: { address: () => { port: number } | string | null } }
  ).server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on a TCP port");
  }

  return { baseUrl: `http://127.0.0.1:${address.port}`, server, store };
}

async function stopServer(started: StartedServer): Promise<void> {
  await started.server.close();
  started.store.close();
}

async function upgradeStatus(
  baseUrl: string,
  headers: Record<string, string> = {},
  path = "/ws"
): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl.replace(/^http/, "ws") + path, { headers });
    const timer = setTimeout(() => reject(new Error("WebSocket upgrade did not settle")), 2_000);
    let settled = false;
    const finish = (status: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.terminate();
      resolve(status);
    };

    socket.once("open", () => finish(101));
    socket.once("unexpected-response", (_request, response) => finish(response.statusCode ?? 0));
    socket.once("error", (error) => {
      if (!settled) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

async function connect(
  baseUrl: string,
  token: string,
  origin = ALLOWED_ORIGIN
): Promise<{ socket: WebSocket; messages: JsonMessage[] }> {
  const socket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/ws", {
    headers: { authorization: `Bearer ${token}`, origin },
  });
  const messages: JsonMessage[] = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(data.toString()) as JsonMessage);
  });
  await once(socket, "open");
  await waitForMessage(messages, (message) => message["type"] === "connected");
  return { socket, messages };
}

async function waitForMessage(
  messages: JsonMessage[],
  predicate: (message: JsonMessage) => boolean,
  timeoutMs = 2_000
): Promise<JsonMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = messages.find(predicate);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const message = messages.find(predicate);
  if (message) return message;
  throw new Error(`Expected WebSocket message was not received: ${JSON.stringify(messages)}`);
}

async function waitForClose(socket: WebSocket): Promise<number> {
  const [code] = (await once(socket, "close")) as [number, Buffer];
  return code;
}

describe("Forge WebSocket security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid WebSocket resource configuration without leaving a listener", async () => {
    const engine = { run: vi.fn() };
    const store = new RunStore(":memory:");
    const server = new ApiServer(engine as never, store, {
      allowedOrigins: [ALLOWED_ORIGIN],
      authToken: GOOD_TOKEN,
      webSocket: { maxConnections: 0 },
    });

    await expect(server.listen(0)).rejects.toThrow(/maxConnections must be a positive integer/i);
    store.close();
  });

  it("rejects missing, invalid, under-scoped, cross-origin, and wrong-path upgrades", async () => {
    const started = await startServer();
    try {
      await expect(upgradeStatus(started.baseUrl, { origin: ALLOWED_ORIGIN })).resolves.toBe(401);
      await expect(
        upgradeStatus(started.baseUrl, {
          authorization: "Bearer invalid",
          origin: ALLOWED_ORIGIN,
        })
      ).resolves.toBe(401);
      await expect(
        upgradeStatus(started.baseUrl, {
          authorization: `Bearer ${EXPIRED_TOKEN}`,
          origin: ALLOWED_ORIGIN,
        })
      ).resolves.toBe(401);
      await expect(
        upgradeStatus(started.baseUrl, {
          authorization: `Bearer ${UNDER_SCOPED_TOKEN}`,
          origin: ALLOWED_ORIGIN,
        })
      ).resolves.toBe(403);
      await expect(
        upgradeStatus(started.baseUrl, {
          authorization: `Bearer ${GOOD_TOKEN}`,
          origin: "https://evil.example",
        })
      ).resolves.toBe(403);
      await expect(
        upgradeStatus(started.baseUrl, { authorization: `Bearer ${GOOD_TOKEN}` })
      ).resolves.toBe(403);
      await expect(
        upgradeStatus(
          started.baseUrl,
          { authorization: `Bearer ${GOOD_TOKEN}`, origin: ALLOWED_ORIGIN },
          "/other"
        )
      ).resolves.toBe(404);
    } finally {
      await stopServer(started);
    }
  });

  it("uses the shared principal scopes for HTTP API authorization", async () => {
    const started = await startServer();
    try {
      const read = await fetch(`${started.baseUrl}/api/pipelines`, {
        headers: { authorization: `Bearer ${UNDER_SCOPED_TOKEN}`, origin: ALLOWED_ORIGIN },
      });
      const write = await fetch(`${started.baseUrl}/api/pipelines`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${UNDER_SCOPED_TOKEN}`,
          "content-type": "application/json",
          origin: ALLOWED_ORIGIN,
        },
        body: JSON.stringify({ name: "blocked", version: "1.0.0", steps: [] }),
      });

      expect(read.status).toBe(200);
      expect(write.status).toBe(403);
    } finally {
      await stopServer(started);
    }
  });

  it("authorizes subscriptions by category and redacts sensitive event fields", async () => {
    const started = await startServer();
    try {
      const { socket, messages } = await connect(started.baseUrl, GOOD_TOKEN);
      socket.send(JSON.stringify({ type: "subscribe", categories: ["runs", "pipelines"] }));
      const subscription = await waitForMessage(
        messages,
        (message) => message["type"] === "subscribed"
      );
      expect(subscription).toMatchObject({
        categories: ["runs"],
        denied: ["pipelines"],
      });

      const delivered = (
        started.server as unknown as {
          broadcastEvent: (category: string, payload: unknown) => number;
        }
      ).broadcastEvent("runs", {
        authorization: "Bearer secret",
        nested: { apiKey: "top-secret", safe: "visible" },
      });
      expect(delivered).toBe(1);

      const event = await waitForMessage(messages, (message) => message["type"] === "event");
      expect(event).toMatchObject({
        category: "runs",
        payload: {
          authorization: "[REDACTED]",
          nested: { apiKey: "[REDACTED]", safe: "visible" },
        },
      });
      expect(
        (
          started.server as unknown as {
            broadcastEvent: (category: string, payload: unknown) => number;
          }
        ).broadcastEvent("pipelines", { safe: true })
      ).toBe(0);
      socket.close();
      await once(socket, "close");
    } finally {
      await stopServer(started);
    }
  });

  it("enforces subscription limits and closes idle clients", async () => {
    const started = await startServer({
      webSocket: {
        idleTimeoutMs: 250,
        maxSubscriptions: 1,
        pingIntervalMs: 500,
      },
    });
    try {
      const admin = await connect(started.baseUrl, ADMIN_TOKEN);
      admin.socket.send(JSON.stringify({ type: "subscribe", categories: ["runs", "pipelines"] }));
      const subscription = await waitForMessage(
        admin.messages,
        (message) => message["type"] === "subscribed"
      );
      expect(subscription).toMatchObject({ categories: ["runs"], denied: ["pipelines"] });
      await expect(waitForClose(admin.socket)).resolves.toBe(1001);
    } finally {
      await stopServer(started);
    }
  });

  it("enforces per-principal connections, message rates, payload size, and queue bounds", async () => {
    const started = await startServer();
    try {
      const first = await connect(started.baseUrl, GOOD_TOKEN);
      await expect(
        upgradeStatus(started.baseUrl, {
          authorization: `Bearer ${GOOD_TOKEN}`,
          origin: ALLOWED_ORIGIN,
        })
      ).resolves.toBe(429);

      const rateLimitClose = waitForClose(first.socket);
      first.socket.send(JSON.stringify({ type: "ping" }));
      first.socket.send(JSON.stringify({ type: "ping" }));
      first.socket.send(JSON.stringify({ type: "ping" }));
      first.socket.send(JSON.stringify({ type: "ping" }));
      await expect(rateLimitClose).resolves.toBe(1008);

      const rateLimitedReconnect = await connect(started.baseUrl, GOOD_TOKEN);
      const reconnectClose = waitForClose(rateLimitedReconnect.socket);
      rateLimitedReconnect.socket.send(JSON.stringify({ type: "ping" }));
      await expect(reconnectClose).resolves.toBe(1008);

      const admin = await connect(started.baseUrl, ADMIN_TOKEN);
      const payloadClose = waitForClose(admin.socket);
      admin.socket.send("x".repeat(300));
      await expect(payloadClose).resolves.toBe(1009);

      const bounded = await connect(started.baseUrl, QUEUE_TOKEN);
      bounded.socket.send(JSON.stringify({ type: "subscribe", categories: ["runs"] }));
      await waitForMessage(bounded.messages, (message) => message["type"] === "subscribed");
      const queueClose = waitForClose(bounded.socket);
      (
        started.server as unknown as {
          broadcastEvent: (category: string, payload: unknown) => number;
        }
      ).broadcastEvent("runs", { output: "x".repeat(2_000) });
      await expect(queueClose).resolves.toBe(1013);
    } finally {
      await stopServer(started);
    }
  });
});
