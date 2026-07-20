import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { Server as OfficialServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "../src/client/MCPClient.js";
import { StreamableHTTPTransport } from "../src/transport/http.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
  vi.restoreAllMocks();
});

describe("StreamableHTTPTransport", () => {
  it("uses one endpoint with standard session and protocol headers", async () => {
    const requests: Array<{ method: string; url: string; headers: Headers; body: string }> = [];
    const sessionId = randomUUID();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      const body = await request.text();
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      const parsed = body ? (JSON.parse(body) as { id?: string; method?: string }) : {};
      if (request.method === "POST" && parsed.method === "initialize") {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: parsed.id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              serverInfo: { name: "wire-server", version: "1.0.0" },
            },
          },
          { headers: { "mcp-session-id": sessionId } }
        );
      }
      if (request.method === "POST" && parsed.id) {
        return Response.json({ jsonrpc: "2.0", id: parsed.id, result: {} });
      }
      return new Response(null, { status: request.method === "DELETE" ? 405 : 202 });
    });

    const transport = new StreamableHTTPTransport({
      url: "https://mcp.example.com/mcp",
      headers: { authorization: "Bearer test" },
      fetch: fetchMock,
      reconnect: false,
    });
    const client = new MCPClient(transport, {
      clientInfo: { name: "wire-client", version: "1" },
    });

    await client.connect();
    await client.ping();
    await client.disconnect();

    expect(requests.every((request) => request.url === "https://mcp.example.com/mcp")).toBe(true);
    expect(requests[0]).toMatchObject({ method: "POST" });
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer test");
    expect(requests.some((request) => request.method === "DELETE")).toBe(true);
    for (const request of requests.slice(1)) {
      expect(request.headers.get("mcp-protocol-version")).toBe("2025-11-25");
      expect(request.headers.get("mcp-session-id")).toBe(sessionId);
    }
  });

  it("resumes SSE on the same endpoint with Last-Event-ID", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(null, { status: 405 });
    });
    const transport = new StreamableHTTPTransport({
      url: "https://mcp.example.com/mcp",
      fetch: fetchMock,
      reconnect: false,
    });

    await transport.start();
    await transport.resumeStream("event-42");
    await transport.close();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "GET", url: "https://mcp.example.com/mcp" });
    expect(requests[0]?.headers.get("last-event-id")).toBe("event-42");
    expect(requests[0]?.headers.get("accept")).toBe("text/event-stream");
  });

  it("fails closed when initialize returns malformed JSON-RPC", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "GET") return new Response(null, { status: 405 });
      return new Response("not-json", { headers: { "content-type": "application/json" } });
    });
    const client = new MCPClient(
      new StreamableHTTPTransport({
        url: "https://mcp.example.com/mcp",
        fetch: fetchMock,
        reconnect: false,
      }),
      { clientInfo: { name: "malformed-client", version: "1" }, connectTimeoutMs: 1_000 }
    );

    await expect(client.connect()).rejects.toThrow();
    await client.disconnect();
  });

  it("interoperates with the official SDK server", async () => {
    const observed: Array<{ method: string; sessionId?: string; protocolVersion?: string }> = [];
    const officialTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });
    const officialServer = new OfficialServer(
      { name: "official-test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    officialServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "echo",
          description: "Echo input",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }));
    await officialServer.connect(officialTransport);

    const httpServer = createServer((request, response) => {
      observed.push({
        method: request.method ?? "",
        ...(readHeader(request, "mcp-session-id")
          ? { sessionId: readHeader(request, "mcp-session-id") }
          : {}),
        ...(readHeader(request, "mcp-protocol-version")
          ? { protocolVersion: readHeader(request, "mcp-protocol-version") }
          : {}),
      });
      void officialTransport.handleRequest(request, response);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    cleanups.push(async () => {
      await officialServer.close();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve()))
      );
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    const client = new MCPClient(
      new StreamableHTTPTransport({
        url: `http://127.0.0.1:${address.port}/mcp`,
        reconnect: false,
      }),
      { clientInfo: { name: "suite-conformance-client", version: "1.0.0" } }
    );
    const initialized = await client.connect();
    const tools = await client.listTools();
    await client.disconnect();

    expect(initialized.protocolVersion).toBe("2025-11-25");
    expect(tools.tools).toEqual([expect.objectContaining({ name: "echo" })]);
    expect(observed.map((request) => request.method)).toContain("DELETE");
    expect(
      observed.some((request) => request.protocolVersion === "2025-11-25" && request.sessionId)
    ).toBe(true);
  });

  it("keeps deprecated HTTP+SSE behind an explicit compatibility mode", async () => {
    const transport = new StreamableHTTPTransport({
      url: "https://legacy.example.com/",
      compatibilityMode: "legacy-http-sse",
      reconnect: false,
    });
    await expect(transport.terminateSession()).rejects.toThrow("has not been started");
    expect(() =>
      transport.setReconnectPolicy({ enabled: false, maxAttempts: 1, delayMs: 1, backoffFactor: 1 })
    ).not.toThrow();
  });
});

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
