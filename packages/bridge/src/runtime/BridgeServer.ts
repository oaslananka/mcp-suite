import { MCPServer } from "@oaslananka/shared";
import type { Tool } from "@oaslananka/shared";

export class BridgeServer {
  constructor(private readonly server: MCPServer, private readonly tools: Tool[]) {
    this.server.getRouter().on("tools/list", async () => ({ tools: this.tools }));
  }

  async start(): Promise<void> {
    await this.server.start();
  }
}
