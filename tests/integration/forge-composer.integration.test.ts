import { describe, expect, it, vi } from "vitest";
import type { PipelineConfig } from "../../packages/forge/src/dsl/schema.js";
import { ForgeEngine } from "../../packages/forge/src/engine/ForgeEngine.js";
import { ComposerProxy } from "../../packages/composer/src/proxy/ComposerProxy.js";

describe("Forge -> Composer integration", () => {
  it("runs a pipeline that calls multiple composer backends through one MCP client", async () => {
    const searchCall = vi.fn(async (tool: string, args?: Record<string, unknown>) => ({
      content: [{ type: "text" as const, text: `${tool}:${JSON.stringify(args)}` }],
    }));
    const mathCall = vi.fn(async (tool: string, args?: Record<string, unknown>) => ({
      content: [{ type: "text" as const, text: `${tool}:${JSON.stringify(args)}` }],
    }));
    const backendManager = {
      listClients: () => [
        { name: "search", status: "connected" as const },
        { name: "math", status: "connected" as const },
      ],
      getClient: (name: string) => {
        if (name === "search") {
          return {
            listTools: async () => ({
              tools: [{ name: "query", description: "Search data", inputSchema: { type: "object" } }],
            }),
            listResources: async () => ({ resources: [] }),
            listPrompts: async () => ({ prompts: [] }),
            callTool: searchCall,
          };
        }

        if (name === "math") {
          return {
            listTools: async () => ({
              tools: [{ name: "sum", description: "Add values", inputSchema: { type: "object" } }],
            }),
            listResources: async () => ({ resources: [] }),
            listPrompts: async () => ({ prompts: [] }),
            callTool: mathCall,
          };
        }

        return null;
      },
    };

    const composer = new ComposerProxy(
      backendManager as never,
      {
        getRouter: () => ({
          on: () => undefined,
        }),
      } as never,
    );

    const composerClient = {
      listTools: async () => (composer as any).listTools(),
      callTool: async (name: string, args?: Record<string, unknown>) =>
        (composer as any).callTool({ name, arguments: args }),
    };

    const engine = new ForgeEngine({ dbPath: ":memory:" });
    const connectionManager = (engine as unknown as { connectionManager: { getClient: (name: string, config: unknown) => Promise<unknown> } }).connectionManager;
    const getClientSpy = vi
      .spyOn(connectionManager, "getClient")
      .mockResolvedValue(composerClient as never);

    const pipeline: PipelineConfig = {
      name: "composer-pipeline",
      version: "1",
      servers: {
        composer: {
          transport: "http",
          url: "http://composer.internal",
        },
      },
      steps: [
        {
          id: "search-step",
          server: "composer",
          tool: "search__query",
          input: { q: "mcp suite" },
        },
        {
          id: "math-step",
          server: "composer",
          tool: "math__sum",
          input: { left: 20, right: 22 },
        },
      ],
    };

    try {
      const result = await engine.run(pipeline);

      expect(result).toMatchObject({
        pipelineId: "composer-pipeline",
        status: "success",
      });
      expect(getClientSpy).toHaveBeenCalledTimes(2);
      expect(searchCall).toHaveBeenCalledWith("query", { q: "mcp suite" });
      expect(mathCall).toHaveBeenCalledWith("sum", { left: 20, right: 22 });
    } finally {
      getClientSpy.mockRestore();
      await engine.stop();
    }
  });
});
