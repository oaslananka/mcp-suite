import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeyMiddleware } from "../src/auth/ApiKeyMiddleware.js";
import { MCPClient } from "../src/client/MCPClient.js";
import { Methods } from "../src/protocol/methods.js";
import { LATEST_PROTOCOL_VERSION } from "../src/protocol/version.js";
import { StreamableHTTPTransport } from "../src/transport/http.js";
import { withRetry } from "../src/utils/retry.js";
import type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from "../src/protocol/jsonrpc.js";
import type { Transport } from "../src/transport/transport.js";

class FailingSendTransport extends EventEmitter implements Transport {
  public sentMessages: JSONRPCMessage[] = [];

  async start(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    this.emit("close");
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);
    const request = message as JSONRPCRequest;
    if (request.method === Methods.Initialize) {
      queueMicrotask(() => this.emit("message", createInitializeResponse(request.id)));
      return;
    }

    if (request.method === Methods.Initialized) {
      return;
    }

    throw new Error("send failed");
  }
}

function createInitializeResponse(id: JSONRPCRequest["id"]): JSONRPCResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      serverInfo: { name: "server", version: "1.0.0" },
    },
  };
}

describe("shared coverage edges", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("extracts custom API key headers and rejects empty or unscoped principals", async () => {
    const middleware = new ApiKeyMiddleware(
      (apiKey) => (apiKey === "secret" ? { id: "user-1" } : null),
      { headerName: "x-api-key", scheme: "Token" }
    );

    expect(middleware.extractKey({ "x-api-key": ["Token secret  "] })).toBe("secret");
    expect(middleware.extractKey({ "x-api-key": "Token   " })).toBeNull();
    await expect(middleware.authorize({ "x-api-key": "Token invalid" })).rejects.toThrow(
      "Invalid API key"
    );
    await expect(middleware.ensureScope({ "x-api-key": "Token secret" }, "admin")).rejects.toThrow(
      "Missing required scope: admin"
    );
  });

  it("covers retry aborts, non-error failures, capped jitter, and retry callbacks", async () => {
    await expect(
      withRetry(async () => "unused", { signal: AbortSignal.abort(), baseDelayMs: 1 })
    ).rejects.toThrow("Retry aborted");

    await expect(
      withRetry(
        async () => {
          throw "plain failure";
        },
        { maxAttempts: 1 }
      )
    ).rejects.toThrow("plain failure");

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const retrySpy = vi.fn();
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("try again");
        }
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 1, onRetry: retrySpy }
    );

    expect(result).toBe("ok");
    expect(randomSpy).toHaveBeenCalled();
    expect(retrySpy).toHaveBeenCalledWith(expect.any(Error), 1, 1);
  });

  it("cleans up failed client sends and ignores responses with no pending request", async () => {
    const transport = new FailingSendTransport();
    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
    });

    await client.connect();
    await expect(client.ping()).rejects.toThrow("send failed");

    const ping = transport.sentMessages.at(-1) as JSONRPCRequest;
    transport.emit("message", {
      jsonrpc: "2.0",
      id: ping.id,
      result: {},
    } satisfies JSONRPCResponse);
    transport.emit("message", {
      jsonrpc: "2.0",
      id: "unknown",
      result: {},
    } satisfies JSONRPCResponse);

    await client.disconnect();
  });

  it("passes reconnect options to HTTP transports when the client owns one", async () => {
    const transport = new StreamableHTTPTransport({ url: "http://localhost:4001" });
    const setReconnectPolicy = vi.spyOn(transport, "setReconnectPolicy");

    new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
      reconnect: { enabled: false, maxAttempts: 2, delayMs: 3, backoffFactor: 4 },
    });

    expect(setReconnectPolicy).toHaveBeenCalledWith({
      enabled: false,
      maxAttempts: 2,
      delayMs: 3,
      backoffFactor: 4,
    });
    await transport.close();
  });

  it("surfaces POST failures and locks reconnect policy after start", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("post down"));
    const transport = new StreamableHTTPTransport({
      url: "http://localhost:4001/mcp",
      reconnect: false,
      fetch: fetchMock,
    });
    const closes: number[] = [];
    transport.on("close", () => closes.push(Date.now()));

    await transport.start();
    expect(() =>
      transport.setReconnectPolicy({ enabled: false, maxAttempts: 1, delayMs: 1, backoffFactor: 1 })
    ).toThrow("cannot change after transport start");
    await expect(transport.send({ jsonrpc: "2.0", method: "ping" })).rejects.toThrow("post down");
    await transport.close();
    expect(closes.length).toBeGreaterThan(0);
  });
});
