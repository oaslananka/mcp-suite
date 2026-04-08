import { ChildProcess, spawn } from "node:child_process";
import { MCPClient, StdioTransport, StreamableHTTPTransport } from "@oaslananka/shared";
import { BackendConfig } from "../config/ConfigLoader.js";

interface BackendEntry {
  client: MCPClient;
  config: BackendConfig;
  process?: ChildProcess;
  status: "connected" | "disconnected";
}

export class BackendManager {
  private readonly clients = new Map<string, BackendEntry>();

  async addBackend(name: string, config: BackendConfig): Promise<void> {
    await this.removeBackend(name);

    let childProcess: ChildProcess | undefined;
    let client: MCPClient;

    if (config.transport === "http") {
      if (!config.url) {
        throw new Error(`Backend "${name}" is missing url`);
      }

      client = new MCPClient(
        new StreamableHTTPTransport({ url: config.url }),
          { clientInfo: { name: "mcp-composer", version: "1.0.0" } }
      );
    } else {
      if (!config.command) {
        throw new Error(`Backend "${name}" is missing command`);
      }

      childProcess = spawn(config.command, config.args ?? [], {
        env: { ...globalThis.process.env, ...config.env }
      });

      if (!childProcess.stdout || !childProcess.stdin) {
        throw new Error(`Unable to attach to backend "${name}" stdio streams`);
      }

      client = new MCPClient(
        new StdioTransport(childProcess.stdout, childProcess.stdin),
          { clientInfo: { name: "mcp-composer", version: "1.0.0" } }
      );
    }

    await client.connect();
    const entry: BackendEntry = { client, config, status: "connected" };
    if (childProcess) {
      entry.process = childProcess;
    }
    this.clients.set(name, entry);
  }

  async removeBackend(name: string): Promise<void> {
    const entry = this.clients.get(name);
    if (!entry) {
      return;
    }

    await entry.client.disconnect().catch(() => undefined);
    entry.process?.kill();
    this.clients.delete(name);
  }

  async reconnectAll(): Promise<void> {
    const entries = Array.from(this.clients.entries());
    this.clients.clear();

    for (const [name, entry] of entries) {
      await this.addBackend(name, entry.config);
    }
  }

  getClient(name: string): MCPClient | null {
    return this.clients.get(name)?.client ?? null;
  }

  listClients(): { name: string; status: "connected" | "disconnected" }[] {
    return Array.from(this.clients.entries()).map(([name, entry]) => ({
      name,
      status: entry.status
    }));
  }
}
