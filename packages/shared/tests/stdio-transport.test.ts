import { PassThrough } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StdioTransport } from "../src/transport/stdio.js";
import type { JSONRPCMessage } from "../src/protocol/jsonrpc.js";

async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("StdioTransport", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("parses valid JSON-RPC lines and emits parse errors for invalid payloads", async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        const transport = new StdioTransport(input, output);

        const messages: JSONRPCMessage[] = [];
        const errors: Error[] = [];

        transport.on("message", (message) => messages.push(message));
        transport.on("error", (error) => errors.push(error as Error));

        await transport.start();

        input.write("{\"jsonrpc\":\"2.0\",\"method\":\"ping\"}\n");
        input.write("not-json\n");
        input.write("\n");

        await flushMicrotasks();

        expect(messages).toEqual([
            expect.objectContaining({ jsonrpc: "2.0", method: "ping" }),
        ]);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toContain("Failed to parse JSON");
    });

    it("writes outbound JSON-RPC messages and emits close when the stream ends", async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        const transport = new StdioTransport(input, output);

        let didClose = false;
        transport.on("close", () => {
            didClose = true;
        });

        await transport.start();
        await transport.send({ jsonrpc: "2.0", method: "notifications/test" });

        const payload = output.read()?.toString("utf8") ?? "";
        expect(payload).toContain("\"method\":\"notifications/test\"");

        await transport.close();
        await flushMicrotasks();

        expect(didClose).toBe(true);
    });
});
