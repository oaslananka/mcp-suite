import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../src/protocol/errors.js";
import type { JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, JSONRPCResponse } from "../src/protocol/jsonrpc.js";
import { Methods } from "../src/protocol/methods.js";
import { LATEST_PROTOCOL_VERSION } from "../src/protocol/version.js";
import { MCPServer } from "../src/server/MCPServer.js";
import { MockTransport } from "../src/testing/MockTransport.js";

function createServerHarness(): {
  server: MCPServer;
  clientTransport: MockTransport;
} {
  const serverTransport = new MockTransport();
  const clientTransport = new MockTransport();
  serverTransport.link(clientTransport);

  const server = new MCPServer(serverTransport, {
    serverInfo: { name: "shared-server", version: "1.0.0" },
    capabilities: {
      tools: {},
    },
  });

  return { server, clientTransport };
}

function waitForMessage(transport: MockTransport): Promise<JSONRPCMessage> {
  return new Promise((resolve) => {
    transport.once("message", (message) => resolve(message as JSONRPCMessage));
  });
}

describe("MCPServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests before initialization and serves them after the initialize handshake", async () => {
    const { server, clientTransport } = createServerHarness();
    server.getRouter().on(Methods.ToolsList, async () => ({
      tools: [{ name: "echo", description: "Echo input", inputSchema: { type: "object" } }],
    }));

    try {
      await clientTransport.start();
      await server.start();

      const pingResponse = waitForMessage(clientTransport);
      await clientTransport.send({
        jsonrpc: "2.0",
        id: "ping-1",
        method: Methods.Ping,
      } satisfies JSONRPCRequest);

      await expect(pingResponse).resolves.toMatchObject<JSONRPCResponse>({
        id: "ping-1",
        error: {
          code: ErrorCodes.InvalidRequest,
          message: "Server not initialized",
        },
      });

      const initializeResponse = waitForMessage(clientTransport);
      await clientTransport.send({
        jsonrpc: "2.0",
        id: "init-1",
        method: Methods.Initialize,
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
        },
      } satisfies JSONRPCRequest);

      await expect(initializeResponse).resolves.toMatchObject<JSONRPCResponse>({
        id: "init-1",
        result: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: { name: "shared-server", version: "1.0.0" },
        },
      });

      await clientTransport.send({
        jsonrpc: "2.0",
        method: Methods.Initialized,
        params: {},
      } satisfies JSONRPCNotification);

      const toolsResponse = waitForMessage(clientTransport);
      await clientTransport.send({
        jsonrpc: "2.0",
        id: "tools-1",
        method: Methods.ToolsList,
      } satisfies JSONRPCRequest);

      await expect(toolsResponse).resolves.toMatchObject<JSONRPCResponse>({
        id: "tools-1",
        result: {
          tools: [expect.objectContaining({ name: "echo" })],
        },
      });
    } finally {
      await server.stop();
      await clientTransport.close();
    }
  });

  it("ignores custom notifications before initialization and delivers them after the handshake", async () => {
    const { server, clientTransport } = createServerHarness();
    const notificationHandler = vi.fn(async () => undefined);
    server.getRouter().onNotification("notifications/custom", notificationHandler);

    try {
      await clientTransport.start();
      await server.start();

      await clientTransport.send({
        jsonrpc: "2.0",
        method: "notifications/custom",
        params: { phase: "pre-init" },
      } satisfies JSONRPCNotification);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(notificationHandler).not.toHaveBeenCalled();

      const initializeResponse = waitForMessage(clientTransport);
      await clientTransport.send({
        jsonrpc: "2.0",
        id: "init-2",
        method: Methods.Initialize,
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
        },
      } satisfies JSONRPCRequest);
      await initializeResponse;

      await clientTransport.send({
        jsonrpc: "2.0",
        method: Methods.Initialized,
        params: {},
      } satisfies JSONRPCNotification);
      await clientTransport.send({
        jsonrpc: "2.0",
        method: "notifications/custom",
        params: { phase: "post-init" },
      } satisfies JSONRPCNotification);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(notificationHandler).toHaveBeenCalledWith({ phase: "post-init" });
    } finally {
      await server.stop();
      await clientTransport.close();
    }
  });

  it("sends notifications to connected peers and cleans up signal listeners on stop", async () => {
    const { server, clientTransport } = createServerHarness();
    const initialSigintListeners = process.listenerCount("SIGINT");
    const initialSigtermListeners = process.listenerCount("SIGTERM");

    try {
      await clientTransport.start();
      await server.start();
      await server.start();

      expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners + 1);
      expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListeners + 1);

      const notification = waitForMessage(clientTransport);
      await server.sendNotification("notifications/ready", { ok: true });

      await expect(notification).resolves.toMatchObject<JSONRPCNotification>({
        method: "notifications/ready",
        params: { ok: true },
      });
    } finally {
      await server.stop();
      await clientTransport.close();
      expect(process.listenerCount("SIGINT")).toBe(initialSigintListeners);
      expect(process.listenerCount("SIGTERM")).toBe(initialSigtermListeners);
    }
  });

  it("shuts down cleanly when the registered SIGINT handler runs", async () => {
    const { server, clientTransport } = createServerHarness();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    try {
      await clientTransport.start();
      await server.start();

      const sigintListener = process.listeners("SIGINT").at(-1);
      expect(typeof sigintListener).toBe("function");

      (sigintListener as (() => void))();
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledWith(0);
      });

      expect(clientTransport.isStarted).toBe(false);
    } finally {
      await server.stop();
      await clientTransport.close();
    }
  });
});
