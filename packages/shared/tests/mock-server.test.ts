import { describe, expect, it } from "vitest";
import { MCPClient } from "../src/client/MCPClient.js";
import { MCPSession } from "../src/client/session.js";
import { Methods } from "../src/protocol/methods.js";
import { MockMCPServer } from "../src/testing/MockMCPServer.js";
import { MockTransport } from "../src/testing/MockTransport.js";
import { ErrorCodes, MCPError } from "../src/protocol/errors.js";

async function createConnectedClient(server: MockMCPServer): Promise<{ client: MCPClient; transport: MockTransport }> {
    const clientTransport = new MockTransport();
    clientTransport.link(server.transport);

    await server.start();

    const client = new MCPClient(clientTransport, {
        clientInfo: { name: "test-client", version: "1.0.0" },
    });
    await client.connect();

    return { client, transport: clientTransport };
}

describe("MockMCPServer", () => {
    it("serves tools to a connected client and captures call history", async () => {
        const server = new MockMCPServer();
        server.mockTools = [
            { name: "echo", description: "Echoes back input", inputSchema: { type: "object" } },
        ];
        server.toolHandlers.set("echo", async (args) => ({
            content: [{ type: "text", text: JSON.stringify(args) }],
        }));

        const { client, transport } = await createConnectedClient(server);
        const tools = await client.listTools();
        const result = await client.callTool("echo", { value: "hi" });

        expect(tools.tools).toHaveLength(1);
        expect(result.content[0]).toMatchObject({ type: "text", text: "{\"value\":\"hi\"}" });
        server.assertToolCalled("echo", { value: "hi" });
        expect(server.captureHistory()).toEqual([
            expect.objectContaining({ kind: "tool", name: "echo" }),
        ]);

        await client.disconnect();
        await transport.close();
        await server.stop();
    });

    it("can simulate errors for the next tool call", async () => {
        const server = new MockMCPServer();
        server.mockTools = [
            { name: "explode", description: "Fails once", inputSchema: { type: "object" } },
        ];
        server.toolHandlers.set("explode", async () => ({
            content: [{ type: "text", text: "should not happen" }],
        }));
        server.simulateError(ErrorCodes.InternalError, "boom");

        const { client, transport } = await createConnectedClient(server);

        await expect(client.callTool("explode")).rejects.toMatchObject<MCPError>({
            code: ErrorCodes.InternalError,
            message: "boom",
        });

        await client.disconnect();
        await transport.close();
        await server.stop();
    });

    it("hydrates a session with tools, resources, and prompts", async () => {
        const server = new MockMCPServer();
        server.mockTools = [
            { name: "echo", description: "Echoes", inputSchema: { type: "object" } },
        ];
        server.mockResources = [
            { uri: "file://demo.txt", name: "Demo file" },
        ];
        server.mockPrompts = [
            { name: "hello", description: "Greets" },
        ];
        server.promptHandlers.set("hello", async () => [
            { role: "assistant", content: { type: "text", text: "Hello!" } },
        ]);
        server.toolHandlers.set("echo", async () => ({
            content: [{ type: "text", text: "ok" }],
        }));

        const clientTransport = new MockTransport();
        clientTransport.link(server.transport);

        await server.start();
        const session = new MCPSession(clientTransport, {
            clientInfo: { name: "session-client", version: "1.0.0" },
        });
        await session.start();

        expect(session.tools.map((tool) => tool.name)).toEqual(["echo"]);
        expect(session.resources.map((resource) => resource.uri)).toEqual(["file://demo.txt"]);
        expect(session.prompts.map((prompt) => prompt.name)).toEqual(["hello"]);

        await session.stop();
        await server.stop();
    });
});
