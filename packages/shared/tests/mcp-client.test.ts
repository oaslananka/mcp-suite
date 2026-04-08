import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "../src/client/MCPClient.js";
import { Methods } from "../src/protocol/methods.js";
import { LATEST_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION } from "../src/protocol/version.js";
import type { JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, JSONRPCResponse } from "../src/protocol/jsonrpc.js";
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
        } = {},
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
                    queueMicrotask(() => instance.emit("message", {
                        jsonrpc: "2.0",
                        id: request.id,
                        result: {},
                    } satisfies JSONRPCResponse));
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
        const assertion = expect(pingPromise).rejects.toThrow("Request timed out for method \"ping\" after 10ms");
        await vi.advanceTimersByTimeAsync(10);

        await assertion;
    });
});
