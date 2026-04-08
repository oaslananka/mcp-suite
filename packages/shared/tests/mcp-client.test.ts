import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "../src/client/MCPClient.js";
import { ErrorCodes } from "../src/protocol/errors.js";
import { Methods } from "../src/protocol/methods.js";
import { LATEST_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION } from "../src/protocol/version.js";
import type {
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest,
  JSONRPCResponse,
} from "../src/protocol/jsonrpc.js";
import type { Transport } from "../src/transport/transport.js";

class ControlledTransport extends EventEmitter implements Transport {
  public started = false;
  public closed = false;
  public sentMessages: JSONRPCMessage[] = [];

  constructor(
    private readonly handlers: {
      start?: () => Promise<void>;
      close?: () => Promise<void>;
      send?: (message: JSONRPCMessage, transport: ControlledTransport) => Promise<void>;
    } = {}
  ) {
    super();
  }

  async start(): Promise<void> {
    this.started = true;
    await this.handlers.start?.();
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.handlers.close?.();
    this.emit("close");
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);
    await this.handlers.send?.(message, this);
  }
}

function createInitializeResponse(protocolVersion: string): JSONRPCResponse {
  return {
    jsonrpc: "2.0",
    id: "init-1",
    result: {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "server", version: "1.0.0" },
    },
  };
}

describe("MCPClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rejects requests before the client is connected", async () => {
    const client = new MCPClient(new ControlledTransport(), {
      clientInfo: { name: "client", version: "1.0.0" },
    });

    await expect(client.listTools()).rejects.toThrow("Client not connected");
  });

  it("connects successfully, accepts the legacy protocol, and forwards notifications", async () => {
    const transport = new ControlledTransport({
      send: async (message, instance) => {
        const request = message as JSONRPCRequest;
        if (request.method === Methods.Initialize) {
          const response = createInitializeResponse(LEGACY_PROTOCOL_VERSION);
          response.id = request.id;
          queueMicrotask(() => instance.emit("message", response));
          return;
        }

        if (request.method === Methods.Ping) {
          queueMicrotask(() =>
            instance.emit("message", {
              jsonrpc: "2.0",
              id: request.id,
              result: {},
            } satisfies JSONRPCResponse)
          );
        }
      },
    });

    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
      capabilities: { roots: { listChanged: true } },
    });

    const notifications: unknown[] = [];
    client.onNotification("notifications/test", (params) => {
      notifications.push(params);
    });

    const initialize = await client.connect();
    expect(initialize.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);
    expect(client.getProtocolVersion()).toBe(LEGACY_PROTOCOL_VERSION);
    expect(client.serverInfo).toEqual({ name: "server", version: "1.0.0" });

    transport.emit("message", {
      jsonrpc: "2.0",
      method: "notifications/test",
      params: { ok: true },
    } satisfies JSONRPCNotification);

    await client.ping();

    expect(notifications).toEqual([{ ok: true }]);
    expect(transport.sentMessages).toEqual([
      expect.objectContaining({
        method: Methods.Initialize,
        params: expect.objectContaining({
          protocolVersion: LATEST_PROTOCOL_VERSION,
        }),
      }),
      expect.objectContaining({
        method: Methods.Initialized,
      }),
      expect.objectContaining({
        method: Methods.Ping,
      }),
    ]);

    await client.disconnect();
    expect(transport.closed).toBe(true);
  });

  it("disconnects when the server responds with an unsupported protocol version", async () => {
    const transport = new ControlledTransport({
      send: async (message, instance) => {
        const request = message as JSONRPCRequest;
        if (request.method === Methods.Initialize) {
          const response = createInitializeResponse("2024-12-01");
          response.id = request.id;
          queueMicrotask(() => instance.emit("message", response));
        }
      },
    });

    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
    });

    await expect(client.connect()).rejects.toThrow("Unsupported MCP protocol version");
    expect(transport.closed).toBe(true);
  });

  it("times out while opening the transport when connect exceeds the configured deadline", async () => {
    vi.useFakeTimers();

    const transport = new ControlledTransport({
      start: () => new Promise(() => undefined),
    });

    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
      connectTimeoutMs: 10,
    });

    const connectPromise = client.connect();
    const assertion = expect(connectPromise).rejects.toThrow("Timed out while opening transport");
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
  });

  it("times out individual requests when no response is received", async () => {
    vi.useFakeTimers();

    const transport = new ControlledTransport({
      send: async (message, instance) => {
        const request = message as JSONRPCRequest;
        if (request.method === Methods.Initialize) {
          const response = createInitializeResponse(LATEST_PROTOCOL_VERSION);
          response.id = request.id;
          queueMicrotask(() => instance.emit("message", response));
        }
      },
    });

    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
      requestTimeoutMs: 10,
    });

    await client.connect();

    const pingPromise = client.ping();
    const assertion = expect(pingPromise).rejects.toThrow(
      'Request timed out for method "ping" after 10ms'
    );
    await vi.advanceTimersByTimeAsync(10);

    await assertion;
  });

  it("maps error responses, supports wrapper methods, and handles transport close events", async () => {
    const transport = new ControlledTransport({
      send: async (message, instance) => {
        const request = message as JSONRPCRequest;
        if (request.method === Methods.Initialize) {
          const response = createInitializeResponse(LATEST_PROTOCOL_VERSION);
          response.id = request.id;
          queueMicrotask(() => instance.emit("message", response));
          return;
        }

        const respond = (payload: JSONRPCResponse) => {
          payload.id = request.id;
          queueMicrotask(() => instance.emit("message", payload));
        };

        switch (request.method) {
          case Methods.ToolsCall:
            respond({
              jsonrpc: "2.0",
              error: {
                code: ErrorCodes.InternalError,
                message: "tool failed",
              },
            });
            break;
          case Methods.ResourcesList:
            respond({
              jsonrpc: "2.0",
              result: { resources: [{ uri: "file://demo.txt", name: "demo" }] },
            });
            break;
          case Methods.ResourcesRead:
            respond({
              jsonrpc: "2.0",
              result: { contents: [{ uri: "file://demo.txt", text: "demo" }] },
            });
            break;
          case Methods.ResourcesSubscribe:
            respond({
              jsonrpc: "2.0",
              result: {},
            });
            break;
          case Methods.PromptsList:
            respond({
              jsonrpc: "2.0",
              result: { prompts: [{ name: "draft", description: "Draft prompt" }] },
            });
            break;
          case Methods.PromptsGet:
            respond({
              jsonrpc: "2.0",
              result: {
                messages: [{ role: "assistant", content: { type: "text", text: "hello" } }],
              },
            });
            break;
          case Methods.SamplingCreateMessage:
            respond({
              jsonrpc: "2.0",
              result: { role: "assistant", content: { type: "text", text: "sample" } },
            });
            break;
          case Methods.TasksGet:
            respond({
              jsonrpc: "2.0",
              result: { id: "task-1", status: "running" },
            });
            break;
          case Methods.Ping:
            queueMicrotask(() => instance.emit("close"));
            break;
          default:
            respond({
              jsonrpc: "2.0",
              result: {},
            });
            break;
        }
      },
    });

    const client = new MCPClient(transport, {
      clientInfo: { name: "client", version: "1.0.0" },
    });
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);

    await client.connect();

    await expect(client.callTool("explode")).rejects.toMatchObject<MCPError>({
      code: ErrorCodes.InternalError,
      message: "tool failed",
    });
    await expect(client.listResources()).resolves.toEqual({
      resources: [{ uri: "file://demo.txt", name: "demo" }],
    });
    await expect(client.readResource("file://demo.txt")).resolves.toEqual({
      contents: [{ uri: "file://demo.txt", text: "demo" }],
    });
    await expect(client.subscribeResource("file://demo.txt")).resolves.toBeUndefined();
    await expect(client.listPrompts()).resolves.toEqual({
      prompts: [{ name: "draft", description: "Draft prompt" }],
    });
    await expect(client.getPrompt("draft")).resolves.toEqual({
      messages: [{ role: "assistant", content: { type: "text", text: "hello" } }],
    });
    await expect(
      client.createMessage({
        messages: [{ role: "user", content: { type: "text", text: "hi" } }],
        maxTokens: 32,
      })
    ).resolves.toEqual({
      role: "assistant",
      content: { type: "text", text: "sample" },
    });
    await expect(client.getTask("task-1")).resolves.toEqual({
      id: "task-1",
      status: "running",
    });

    await expect(client.ping()).rejects.toThrow("Transport closed");
    expect(disconnected).toHaveBeenCalledTimes(1);

    await client.disconnect();
    expect(disconnected).toHaveBeenCalledTimes(1);
  });
});
