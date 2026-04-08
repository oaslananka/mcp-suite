import { describe, expect, it, vi } from "vitest";
import { ComposerProxy } from "../src/proxy/ComposerProxy.js";

describe("ComposerProxy", () => {
  it("lists namespaced tools, routes tool calls, and aggregates resources and prompts", async () => {
    const githubClient = {
      listTools: vi.fn(async () => ({
        tools: [{ name: "search", description: "Search code", inputSchema: { type: "object" } }],
      })),
      callTool: vi.fn(async (name, args) => ({ content: [{ type: "text", text: `${name}:${JSON.stringify(args)}` }] })),
      listResources: vi.fn(async () => ({ resources: [{ uri: "file://repo", name: "Repo" }] })),
      listPrompts: vi.fn(async () => ({ prompts: [{ name: "triage", description: "Triage prompt" }] })),
    };

    const backendManager = {
      listClients: () => [{ name: "github", status: "connected" as const }],
      getClient: (name: string) => (name === "github" ? githubClient : null),
    };

    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const server = {
      getRouter: () => ({
        on: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, handler),
      }),
    };

    const proxy = new ComposerProxy(backendManager as never, server as never);

    expect(await (proxy as any).listTools()).toEqual({
      tools: [expect.objectContaining({ name: "github__search" })],
    });
    expect(await (proxy as any).callTool({ name: "github__search", arguments: { q: "mcp" } })).toMatchObject({
      content: [{ type: "text", text: 'search:{"q":"mcp"}' }],
    });
    expect(await (proxy as any).listResources()).toEqual({
      resources: [{ uri: "file://repo", name: "Repo" }],
    });
    expect(await (proxy as any).listPrompts()).toEqual({
      prompts: [{ name: "triage", description: "Triage prompt" }],
    });

    expect(() => handlers.get("tools/list")).not.toThrow();
    await expect((proxy as any).callTool({ name: "missing__search" })).rejects.toThrow('Backend "missing" is not connected');
  });
});
