import { describe, expect, it, vi } from "vitest";
import type { ParsedAPI } from "../src/parsers/OpenAPIParser.js";
import { ToolGenerator } from "../src/generators/ToolGenerator.js";
import { MCPServerGenerator } from "../src/generators/MCPServerGenerator.js";
import { BridgeServer } from "../src/runtime/BridgeServer.js";

const API: ParsedAPI = {
  servers: ["https://api.example.com"],
  securitySchemes: {},
  endpoints: [
    {
      method: "GET",
      path: "/pets",
      operationId: "listPets",
      description: "List pets"
    },
    {
      method: "POST",
      path: "/pets",
      operationId: "createPet"
    }
  ]
};

describe("Bridge generators", () => {
  it("generates tool definitions from parsed endpoints", () => {
    const mapper = {
      openAPIToJsonSchema: vi.fn().mockReturnValue({ type: "object", properties: { id: { type: "string" } } })
    };
    const generator = new ToolGenerator(mapper as never);

    const tools = generator.generate(API);

    expect(mapper.openAPIToJsonSchema).toHaveBeenCalledTimes(2);
    expect(tools).toEqual([
      {
        name: "listPets",
        description: "List pets",
        inputSchema: { type: "object", properties: { id: { type: "string" } } }
      },
      {
        name: "createPet",
        description: "POST /pets",
        inputSchema: { type: "object", properties: { id: { type: "string" } } }
      }
    ]);
  });

  it("creates generated server assets with defaults and explicit overrides", () => {
    const toolGenerator = {
      generate: vi.fn().mockReturnValue([{ name: "listPets" }])
    };
    const generator = new MCPServerGenerator(toolGenerator as never);

    const generated = generator.generate(API, {
      packageName: "@oaslananka/generated-pets",
      serverName: "pet-bridge"
    });
    const fallbackGenerated = generator.generate(API);

    expect(toolGenerator.generate).toHaveBeenCalledTimes(2);
    expect(generated.serverCode).toContain("\"name\": \"listPets\"");
    expect(JSON.parse(generated.packageJson)).toMatchObject({
      name: "@oaslananka/generated-pets",
      version: "1.0.0",
      type: "module"
    });
    expect(generated.readme).toContain("# pet-bridge");
    expect(JSON.parse(fallbackGenerated.packageJson).name).toBe("generated-bridge-server");
  });

  it("registers a tools/list route and starts the underlying MCP server", async () => {
    const on = vi.fn();
    const start = vi.fn().mockResolvedValue(undefined);
    const fakeServer = {
      getRouter: () => ({ on }),
      start
    };
    const tools = [{ name: "listPets" }];

    const bridgeServer = new BridgeServer(fakeServer as never, tools as never);
    await bridgeServer.start();

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith("tools/list", expect.any(Function));
    expect(start).toHaveBeenCalledTimes(1);

    const handler = on.mock.calls[0]?.[1] as (() => Promise<unknown>) | undefined;
    await expect(handler?.()).resolves.toEqual({ tools });
  });
});
