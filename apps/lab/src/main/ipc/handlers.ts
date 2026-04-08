import { BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "child_process";
import { MCPClient, StdioTransport, StreamableHTTPTransport } from "@oaslananka/shared";
import type { ServerCapabilities } from "@oaslananka/shared";
import { MockEngine } from "../../lib/mockEngine.js";
import { IpcChannel } from "./channels.js";
import { ConnectionRecord, LabDatabase } from "../storage/db.js";

interface ConnectServerOptions {
  type: "stdio" | "http";
  name: string | undefined;
  url: string | undefined;
  command: string | undefined;
  args: string[] | undefined;
}

interface ActiveSession {
  connection: ConnectionRecord;
  serverInfo: { name: string; version: string };
  capabilities: ServerCapabilities;
}

let activeClient: MCPClient | null = null;
let activeProcess: ChildProcess | null = null;
let activeSession: ActiveSession | null = null;
let mockEngineInstance: MockEngine | null = null;

export function registerHandlers(db: LabDatabase, _window: BrowserWindow | null): void {
  ipcMain.handle(IpcChannel.ConnectServer, async (_, opts: ConnectServerOptions) => {
    try {
      await disconnectActiveServer();

      const connection = buildConnectionRecord(opts);
      const transport = createTransport(opts);

      activeClient = new MCPClient(transport, {
      clientInfo: { name: "mcp-lab", version: "1.0.0" },
      });

      const initResult = await activeClient.connect();
      const savedConnection = db.saveConnection(connection);
      activeSession = {
        connection: savedConnection,
        capabilities: initResult.capabilities,
        serverInfo: initResult.serverInfo,
      };

      return {
        success: true,
        connection: savedConnection,
        capabilities: initResult.capabilities,
        serverInfo: initResult.serverInfo,
      };
    } catch (error) {
      await disconnectActiveServer();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(IpcChannel.DisconnectServer, async () => {
    await disconnectActiveServer();
    return { success: true };
  });

  ipcMain.handle(IpcChannel.GetServerInfo, async () => {
    if (!activeSession) {
      return { connected: false };
    }

    return {
      connected: true,
      connection: activeSession.connection,
      capabilities: activeSession.capabilities,
      serverInfo: activeSession.serverInfo,
    };
  });

  ipcMain.handle(IpcChannel.ListConnections, async () => db.listConnections());

  ipcMain.handle(IpcChannel.SetFavoriteConnection, async (_, id: string, favorite: boolean) => {
    return db.setFavoriteConnection(id, favorite);
  });

  ipcMain.handle(IpcChannel.ListTools, async () => {
    ensureConnected();
    return activeClient!.listTools();
  });

  ipcMain.handle(IpcChannel.CallTool, async (_, toolName: string, args: Record<string, unknown>) => {
    ensureConnected();
    const start = Date.now();

    try {
      const result = await activeClient!.callTool(toolName, args);
      const latency = Date.now() - start;
      db.recordToolCall({
        connectionId: activeSession?.connection.id ?? "active",
        toolName,
        input: JSON.stringify(args),
        output: JSON.stringify(result),
        latencyMs: latency,
        isError: Boolean(result.isError),
      });
      return { result, latency };
    } catch (error) {
      const latency = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      db.recordToolCall({
        connectionId: activeSession?.connection.id ?? "active",
        toolName,
        input: JSON.stringify(args),
        output: JSON.stringify({ error: message }),
        latencyMs: latency,
        isError: true,
      });
      throw error;
    }
  });

  ipcMain.handle(IpcChannel.ListResources, async () => {
    ensureConnected();
    return activeClient!.listResources();
  });

  ipcMain.handle(IpcChannel.ReadResource, async (_, uri: string) => {
    ensureConnected();
    return activeClient!.readResource(uri);
  });

  ipcMain.handle(IpcChannel.SubscribeResource, async () => {
    return {
      supported: false,
      message: "Resource subscriptions are not implemented in the desktop lab yet.",
    };
  });

  ipcMain.handle(IpcChannel.ListPrompts, async () => {
    ensureConnected();
    return activeClient!.listPrompts();
  });

  ipcMain.handle(IpcChannel.GetPrompt, async (_, name: string, args: Record<string, unknown>) => {
    ensureConnected();
    return activeClient!.getPrompt(name, stringifyPromptArgs(args));
  });

  ipcMain.handle(IpcChannel.GetHistory, async () => db.listToolCalls());

  ipcMain.handle(IpcChannel.ListCollections, async () => db.listCollections());

  ipcMain.handle(IpcChannel.StartMock, async () => {
    mockEngineInstance = new MockEngine();
    return { success: true, port: 4001 };
  });

  ipcMain.handle(IpcChannel.StopMock, async () => {
    mockEngineInstance = null;
    return { success: true };
  });

  ipcMain.handle(IpcChannel.GetSettings, async () => ({
    theme: "system",
    activeConnectionId: activeSession?.connection.id ?? null,
  }));

  void mockEngineInstance;
}

function ensureConnected(): void {
  if (!activeClient || !activeSession) {
    throw new Error("Not connected");
  }
}

function buildConnectionRecord(opts: ConnectServerOptions): Omit<ConnectionRecord, "createdAt"> {
  const normalizedArgs = opts.args ?? [];
  const endpoint = opts.type === "http" ? (opts.url ?? "") : (opts.command ?? "");
  const name = opts.name?.trim()
    || (opts.type === "http" ? opts.url?.trim() : opts.command?.trim())
    || "Unnamed MCP server";

  return {
    id: randomUUID(),
    name,
    type: opts.type,
    endpoint,
    command: opts.command,
    args: normalizedArgs,
    favorite: false,
  };
}

function stringifyPromptArgs(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
  );
}

function createTransport(opts: ConnectServerOptions): StdioTransport | StreamableHTTPTransport {
  if (opts.type === "stdio" && opts.command) {
    activeProcess = spawn(opts.command, opts.args ?? [], { env: process.env });
    if (!activeProcess.stdout || !activeProcess.stdin) {
      throw new Error("Failed to attach stdio");
    }
    return new StdioTransport(activeProcess.stdout, activeProcess.stdin);
  }

  if (opts.type === "http" && opts.url) {
    return new StreamableHTTPTransport({ url: opts.url });
  }

  throw new Error("Invalid connection options");
}

async function disconnectActiveServer(): Promise<void> {
  if (activeClient) {
    await activeClient.disconnect();
  }

  if (activeProcess) {
    activeProcess.kill();
  }

  activeClient = null;
  activeProcess = null;
  activeSession = null;
}
