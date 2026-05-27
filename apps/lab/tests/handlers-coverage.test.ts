import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (...args: unknown[]) => unknown;

const registeredHandlers = vi.hoisted(() => new Map<string, IpcHandler>());
const ipcHandle = vi.hoisted(() =>
  vi.fn((channel: string, handler: IpcHandler) => {
    registeredHandlers.set(channel, handler);
  })
);
const spawnMock = vi.hoisted(() => vi.fn());
const spawnSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn(() => false));
const killMock = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  callTool: vi.fn(),
  listResources: vi.fn(),
  listPrompts: vi.fn(),
}));
const MCPClientMock = vi.hoisted(() =>
  vi.fn(
    class MockMCPClient {
      constructor() {
        return client;
      }
    }
  )
);
const StreamableHTTPTransportMock = vi.hoisted(() =>
  vi.fn(
    class MockStreamableHTTPTransport {
      options: unknown;

      constructor(options: unknown) {
        this.options = options;
      }
    }
  )
);
const StdioTransportMock = vi.hoisted(() =>
  vi.fn(
    class MockStdioTransport {
      stdout: unknown;
      stdin: unknown;

      constructor(stdout: unknown, stdin: unknown) {
        this.stdout = stdout;
        this.stdin = stdin;
      }
    }
  )
);

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { handle: ipcHandle },
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("@oaslananka/shared", () => ({
  MCPClient: MCPClientMock,
  StdioTransport: StdioTransportMock,
  StreamableHTTPTransport: StreamableHTTPTransportMock,
}));

async function loadHandlersModule() {
  vi.resetModules();
  registeredHandlers.clear();
  const handlersModule = await import("../src/main/ipc/handlers.js");
  const channelsModule = await import("../src/main/ipc/channels.js");
  return {
    IpcChannel: channelsModule.IpcChannel,
    registerHandlers: handlersModule.registerHandlers,
    resolveStdioCommand: handlersModule.resolveStdioCommand,
    withWindowsCommandPath: handlersModule.withWindowsCommandPath,
  };
}

function createDatabaseMock() {
  return {
    saveConnection: vi.fn((connection: Record<string, unknown>) => ({
      ...connection,
      createdAt: "2026-04-07T00:00:00.000Z",
    })),
    listConnections: vi.fn(),
    deleteConnection: vi.fn(),
    deleteAllConnections: vi.fn(),
    setFavoriteConnection: vi.fn(),
    recordToolCall: vi.fn(),
    listToolCalls: vi.fn(),
    listCollections: vi.fn(),
  };
}

function getHandler(channel: string): IpcHandler {
  const handler = registeredHandlers.get(channel);
  if (!handler) {
    throw new Error(`Handler was not registered: ${channel}`);
  }
  return handler;
}

describe("registerHandlers coverage edges", () => {
  beforeEach(() => {
    registeredHandlers.clear();
    ipcHandle.mockClear();
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    killMock.mockReset();
    client.connect.mockReset();
    client.disconnect.mockReset();
    client.callTool.mockReset();
    client.listResources.mockReset();
    client.listPrompts.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("records failed tool calls and rethrows unsupported resource errors", async () => {
    client.connect.mockResolvedValue({ serverInfo: { name: "Lab" }, capabilities: {} });
    client.callTool.mockRejectedValueOnce(new Error("tool failed"));
    client.listResources.mockRejectedValueOnce(new Error("resource failed"));
    client.listPrompts.mockRejectedValueOnce("prompt failed");
    const db = createDatabaseMock();
    const { IpcChannel, registerHandlers } = await loadHandlersModule();

    registerHandlers(db as never, null);
    await getHandler(IpcChannel.ConnectServer)({}, { type: "http", url: "https://mcp.example" });

    await expect(getHandler(IpcChannel.CallTool)({}, "search", { q: "mcp" })).rejects.toThrow(
      "tool failed"
    );
    await expect(getHandler(IpcChannel.ListResources)({})).rejects.toThrow("resource failed");
    await expect(getHandler(IpcChannel.ListPrompts)({})).rejects.toBe("prompt failed");
    expect(db.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ isError: true, output: JSON.stringify({ error: "tool failed" }) })
    );
  });

  it("returns structured errors for invalid or failed stdio startup", async () => {
    const db = createDatabaseMock();
    const { IpcChannel, registerHandlers } = await loadHandlersModule();
    registerHandlers(db as never, null);
    const connect = getHandler(IpcChannel.ConnectServer);

    const invalid = await connect({}, { type: "stdio", command: undefined, args: undefined });
    spawnMock.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });
    const spawnFailure = await connect({}, { type: "stdio", command: "node", args: [] });
    spawnMock.mockReturnValueOnce({ stdout: null, stdin: {}, kill: killMock, on: vi.fn() });
    const missingStreams = await connect({}, { type: "stdio", command: "node", args: [] });

    expect(invalid).toMatchObject({ success: false, error: "Invalid connection options" });
    expect(spawnFailure).toMatchObject({ success: false, error: "spawn failed" });
    expect(missingStreams).toMatchObject({ success: false });
    expect(String((missingStreams as { error: unknown }).error)).toContain("Failed to start");
  });

  it("resolves package manager commands through Windows fallback locations", async () => {
    const env = {
      APPDATA: "C:\\Users\\Admin\\AppData\\Roaming",
      Path: "C:\\Existing\\bin",
    } satisfies NodeJS.ProcessEnv;
    spawnSyncMock.mockReturnValue({ stdout: "" });
    existsSyncMock.mockImplementation(
      (candidate: string) => candidate === "C:\\Users\\Admin\\AppData\\Roaming\\npm\\pnpm.cmd"
    );
    const { resolveStdioCommand, withWindowsCommandPath } = await loadHandlersModule();

    const command = resolveStdioCommand("pnpm", "win32", env);
    const resolvedEnv = withWindowsCommandPath(env, "win32");

    expect(command).toBe("C:\\Users\\Admin\\AppData\\Roaming\\npm\\pnpm.cmd");
    expect(resolvedEnv).toMatchObject({
      Path: expect.stringContaining("C:\\Users\\Admin\\AppData\\Roaming\\npm"),
    });
    expect(resolvedEnv.Path).toContain("C:\\Existing\\bin");
  });

  it("keeps raw stdio commands and non-Windows environments unchanged", async () => {
    client.connect.mockResolvedValue({ serverInfo: { name: "Local" }, capabilities: {} });
    spawnMock.mockReturnValue({ stdout: {}, stdin: {}, kill: killMock, on: vi.fn() });
    const db = createDatabaseMock();
    const { IpcChannel, registerHandlers, resolveStdioCommand, withWindowsCommandPath } =
      await loadHandlersModule();
    const env = { PATH: "/usr/bin" } satisfies NodeJS.ProcessEnv;

    registerHandlers(db as never, null);
    const result = await getHandler(IpcChannel.ConnectServer)(
      {},
      { type: "stdio", command: "node", args: ["server.js"] }
    );

    expect(result).toMatchObject({ success: true });
    expect(resolveStdioCommand("pnpm", "linux", env)).toBe("pnpm");
    expect(withWindowsCommandPath(env, "linux")).toBe(env);
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledWith(
      "node",
      ["server.js"],
      expect.objectContaining({ env: expect.any(Object), windowsHide: true })
    );
  });
});
