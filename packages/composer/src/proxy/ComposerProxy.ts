import { MCPServer, Tool } from "@oaslananka/shared";
import { BackendManager } from "../backends/BackendManager.js";
import { NamespacedTools } from "./NamespacedTools.js";
import { ToolRouter } from "./ToolRouter.js";

export class ComposerProxy {
  private readonly router = new ToolRouter();

  constructor(
    private readonly backendManager: BackendManager,
    private readonly server: MCPServer,
    private readonly separator = "__"
  ) {
    const router = this.server.getRouter();
    router.on("tools/list", this.listTools.bind(this));
    router.on("tools/call", async (params) =>
      this.callTool(params as { name: string; arguments?: Record<string, unknown> })
    );
    router.on("resources/list", this.listResources.bind(this));
    router.on("prompts/list", this.listPrompts.bind(this));
  }

  private async listTools(): Promise<{ tools: Tool[] }> {
    const allTools: Tool[] = [];

    for (const backend of this.backendManager.listClients()) {
      const client = this.backendManager.getClient(backend.name);
      if (!client) {
        continue;
      }

      const response = await client.listTools();
      allTools.push(...response.tools.map((tool) => NamespacedTools.add(tool, backend.name, this.separator)));
    }

    return { tools: allTools };
  }

  private async callTool(params: { name: string; arguments?: Record<string, unknown> }) {
    const route = this.router.route(params.name);
    const client = this.backendManager.getClient(route.backendName);
    if (!client) {
      throw new Error(`Backend "${route.backendName}" is not connected`);
    }

    return client.callTool(route.toolName, params.arguments);
  }

  private async listResources() {
    const resources = [];
    for (const backend of this.backendManager.listClients()) {
      const client = this.backendManager.getClient(backend.name);
      if (!client) {
        continue;
      }

      const response = await client.listResources();
      resources.push(...response.resources);
    }

    return { resources };
  }

  private async listPrompts() {
    const prompts = [];
    for (const backend of this.backendManager.listClients()) {
      const client = this.backendManager.getClient(backend.name);
      if (!client) {
        continue;
      }

      const response = await client.listPrompts();
      prompts.push(...response.prompts);
    }

    return { prompts };
  }
}
