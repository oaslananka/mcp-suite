import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamableHTTPTransport } from "../src/transport/http.js";

function createSseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
    });
}

function createOpenSseResponse(): { response: Response; close: () => void } {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
        start(ctrl) {
            controller = ctrl;
        },
    });

    return {
        response: new Response(stream, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
        }),
        close: () => controller?.close(),
    };
}

async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("StreamableHTTPTransport", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.useRealTimers();
    });

    it("opens the SSE stream, emits parsed messages, and sends JSON-RPC POST requests", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                createSseResponse([
                    "data: {\"jsonrpc\":\"2.0\",\"id\":\"1\",\"result\":{\"ok\":true}}\n\n",
                ]),
            )
            .mockResolvedValueOnce(new Response(null, { status: 202, statusText: "Accepted" }));

        globalThis.fetch = fetchMock;

        const transport = new StreamableHTTPTransport({
            url: "http://localhost:4001",
            headers: { authorization: "Bearer token" },
            reconnect: false,
        });

        const messages: unknown[] = [];
        const closes: number[] = [];

        transport.on("message", (message) => messages.push(message));
        transport.on("close", () => {
            closes.push(Date.now());
        });

        await transport.start();
        await flushMicrotasks();

        expect(messages).toEqual([
            expect.objectContaining({ id: "1", result: { ok: true } }),
        ]);

        await transport.send({ jsonrpc: "2.0", method: "ping" });

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "http://localhost:4001/message",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    authorization: "Bearer token",
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": "2025-11-25",
                    "X-MCP-Session-ID": expect.any(String),
                }),
                body: JSON.stringify({ jsonrpc: "2.0", method: "ping" }),
            }),
        );
        expect(closes.length).toBeGreaterThan(0);
    });

    it("emits parse errors for malformed SSE messages", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(createSseResponse(["data: not-json\n\n"]));

        globalThis.fetch = fetchMock;

        const transport = new StreamableHTTPTransport({
            url: "http://localhost:4001",
            reconnect: false,
        });
        const errors: string[] = [];

        transport.on("error", (error) => {
            errors.push((error as Error).message);
        });

        await transport.start();
        await flushMicrotasks();

        expect(errors).toEqual([expect.stringContaining("Parse error in SSE")]);
    });

    it("retries failed SSE connections with the configured backoff policy", async () => {
        vi.useFakeTimers();

        const openStream = createOpenSseResponse();
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(new Error("network down"))
            .mockResolvedValueOnce(openStream.response);

        globalThis.fetch = fetchMock;

        const transport = new StreamableHTTPTransport({
            url: "http://localhost:4001",
            reconnect: true,
            maxReconnectAttempts: 3,
            reconnectDelayMs: 5,
            reconnectBackoffFactor: 2,
        });

        const startPromise = transport.start();
        await vi.advanceTimersByTimeAsync(5);
        await startPromise;

        expect(fetchMock).toHaveBeenCalledTimes(2);

        openStream.close();
        await transport.close();
    });

    it("emits an error when the connection cannot be re-established", async () => {
        vi.useFakeTimers();

        const fetchMock = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error("still down"));

        globalThis.fetch = fetchMock;

        const transport = new StreamableHTTPTransport({
            url: "http://localhost:4001",
            reconnect: true,
            maxReconnectAttempts: 2,
            reconnectDelayMs: 5,
        });

        const errors: string[] = [];
        const closes: number[] = [];
        transport.on("error", (error) => errors.push((error as Error).message));
        transport.on("close", () => {
            closes.push(Date.now());
        });

        const startPromise = transport.start();
        await vi.advanceTimersByTimeAsync(5);
        await startPromise;

        expect(errors).toContain("still down");
        expect(closes.length).toBeGreaterThan(0);
    });
});
