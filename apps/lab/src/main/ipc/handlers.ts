import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import type { ChildProcess } from "child_process";
import { spawn, spawnSync } from "child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MCPClient, StdioTransport, StreamableHTTPTransport } from "@oaslananka/shared";
import type { ServerCapabilities } from "@oaslananka/shared";
import { MockEngine } from "../../lib/mockEngine.js";
import { IpcChannel } from "./channels.js";
import type { ConnectionRecord, LabDatabase } from "../storage/db.js";

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

  ipcMain.handle(IpcChannel.DeleteConnection, async (_, id: string) => {
    return { success: db.deleteConnection(id) };
  });

  ipcMain.handle(IpcChannel.DeleteAllConnections, async () => {
    const deleted = db.deleteAllConnections();
    return { success: true, deleted };
  });

  ipcMain.handle(IpcChannel.SetFavoriteConnection, async (_, id: string, favorite: boolean) => {
    return db.setFavoriteConnection(id, favorite);
  });

  ipcMain.handle(IpcChannel.ListTools, async () => {
    ensureConnected();
    return activeClient!.listTools();
  });

  ipcMain.handle(
    IpcChannel.CallTool,
    async (_, toolName: string, args: Record<string, unknown>) => {
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
    }
  );

  ipcMain.handle(IpcChannel.ListResources, async () => {
    ensureConnected();
    try {
      return await activeClient!.listResources();
    } catch (error) {
      if (isMethodNotFoundError(error)) {
        return { resources: [] };
      }
      throw error;
    }
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
    try {
      return await activeClient!.listPrompts();
    } catch (error) {
      if (isMethodNotFoundError(error)) {
        return { prompts: [] };
      }
      throw error;
    }
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
  const name =
    opts.name?.trim() ||
    (opts.type === "http" ? opts.url?.trim() : opts.command?.trim()) ||
    "Unnamed MCP server";

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
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ])
  );
}

function createTransport(opts: ConnectServerOptions): StdioTransport | StreamableHTTPTransport {
  if (opts.type === "stdio" && opts.command) {
    const originalCommand = opts.command.trim();
    const command = resolveStdioCommand(opts.command);
    const args = opts.args ?? [];
    const env = withWindowsCommandPath(process.env);
    const useWindowsShellCommand =
      process.platform === "win32" && shouldUseShellForCommand(originalCommand);

    try {
      activeProcess = useWindowsShellCommand
        ? spawn(buildWindowsCommandLine(originalCommand, args), {
            env,
            windowsHide: true,
            shell: true,
          })
        : spawn(command, args, {
            env,
            windowsHide: true,
          });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }

    // Avoid crashing the main process on spawn failures (e.g., missing command in PATH).
    activeProcess.on("error", (_error) => {
      // Connection flow will report failure via IPC response.
    });

    if (!activeProcess.stdout || !activeProcess.stdin) {
      throw new Error(`Failed to start command: ${originalCommand}`);
    }
    return new StdioTransport(activeProcess.stdout, activeProcess.stdin);
  }

  if (opts.type === "http" && opts.url) {
    return new StreamableHTTPTransport({ url: opts.url });
  }

  throw new Error("Invalid connection options");
}

function resolveStdioCommand(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  const normalized = command.trim();
  const lower = normalized.toLowerCase();

  if (lower === "npx" || lower === "npm" || lower === "pnpm") {
    const resolved = resolveWindowsPackageManagerCommand(lower);
    if (resolved) {
      return resolved;
    }
  }

  return normalized;
}

function shouldUseShellForCommand(originalCommand: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const lower = originalCommand.trim().toLowerCase();
  return lower === "npx" || lower === "npm" || lower === "pnpm";
}

function resolveWindowsPackageManagerCommand(name: string): string | undefined {
  const whereResult = spawnSync("where.exe", [`${name}.cmd`], {
    windowsHide: true,
    encoding: "utf8",
  });

  const first = whereResult.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && existsSync(line));
  if (first) {
    return first;
  }

  const candidates = [
    join(process.env["ProgramFiles"] ?? "C:\\Program Files", "nodejs", `${name}.cmd`),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "nodejs", `${name}.cmd`),
    join(process.env["LOCALAPPDATA"] ?? "", "Programs", "nodejs", `${name}.cmd`),
    join(process.env["APPDATA"] ?? "", "npm", `${name}.cmd`),
  ];

  return candidates.find((candidate) => candidate.length > 0 && existsSync(candidate));
}

function withWindowsCommandPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return env;
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
  const currentPath = env[pathKey] ?? "";
  const extras = [
    join(process.env["ProgramFiles"] ?? "C:\\Program Files", "nodejs"),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "nodejs"),
    join(process.env["LOCALAPPDATA"] ?? "", "Programs", "nodejs"),
    join(process.env["APPDATA"] ?? "", "npm"),
  ].filter((part) => part.length > 0);

  const merged = Array.from(new Set([...extras, ...currentPath.split(";").filter(Boolean)]));

  return {
    ...env,
    [pathKey]: merged.join(";"),
  };
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  return [command, ...args].map((value) => quoteWindowsCmdArg(value)).join(" ");
}

function quoteWindowsCmdArg(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"&|<>^]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function isMethodNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown };
  return candidate.code === -32601;
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
