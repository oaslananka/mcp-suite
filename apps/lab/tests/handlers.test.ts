import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registeredHandlers = vi.hoisted(() => new Map<string, Function>());
const ipcHandle = vi.hoisted(() =>
  vi.fn((channel: string, handler: Function) => {
    registeredHandlers.set(channel, handler);
  })
);
const spawnMock = vi.hoisted(() => vi.fn());
const killMock = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  listResources: vi.fn(),
  readResource: vi.fn(),
  listPrompts: vi.fn(),
  getPrompt: vi.fn(),
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
      kind = "http";
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
      kind = "stdio";
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
  ipcMain: {
    handle: ipcHandle,
  },
}));

vi.mock("child_process", () => ({
  spawn: spawnMock,
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
    registerHandlers: handlersModule.registerHandlers,
    IpcChannel: channelsModule.IpcChannel,
  };
}

function createDatabaseMock() {
  return {
    saveConnection: vi.fn((connection) => ({
      ...connection,
      createdAt: "2026-04-07T00:00:00.000Z",
    })),
    listConnections: vi.fn().mockReturnValue([{ id: "conn-1" }]),
    deleteConnection: vi.fn().mockReturnValue(true),
    deleteAllConnections: vi.fn().mockReturnValue(3),
    setFavoriteConnection: vi
      .fn()
      .mockImplementation((id: string, favorite: boolean) => ({ id, favorite })),
    recordToolCall: vi.fn(),
    listToolCalls: vi.fn().mockReturnValue([{ id: "call-1" }]),
    listCollections: vi.fn().mockReturnValue([{ id: "collection-1" }]),
  };
}

describe("registerHandlers", () => {
  beforeEach(() => {
    registeredHandlers.clear();
    ipcHandle.mockClear();
    spawnMock.mockReset();
    killMock.mockReset();
    client.connect.mockReset();
    client.disconnect.mockReset();
    client.listTools.mockReset();
    client.callTool.mockReset();
    client.listResources.mockReset();
    client.readResource.mockReset();
    client.listPrompts.mockReset();
    client.getPrompt.mockReset();
    StreamableHTTPTransportMock.mockClear();
    StdioTransportMock.mockClear();
    MCPClientMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers HTTP session handlers and serves connected operations", async () => {
    client.connect.mockResolvedValue({
      serverInfo: { name: "Registry", version: "1.0.0" },
      capabilities: { tools: {} },
    });
    client.disconnect.mockResolvedValue(undefined);
    client.listTools.mockResolvedValue({ tools: [{ name: "search" }] });
    client.callTool.mockResolvedValue({ isError: false, content: [{ type: "text", text: "ok" }] });
    client.listResources.mockResolvedValue({ resources: [{ uri: "resource://docs" }] });
    client.readResource.mockResolvedValue({ uri: "resource://docs", text: "hello" });
    client.listPrompts.mockResolvedValue({ prompts: [{ name: "review" }] });
    client.getPrompt.mockResolvedValue({ name: "review", messages: [] });

    const db = createDatabaseMock();
    const { registerHandlers, IpcChannel } = await loadHandlersModule();
    registerHandlers(db as never, null);

    const connect = registeredHandlers.get(IpcChannel.ConnectServer);
    const disconnect = registeredHandlers.get(IpcChannel.DisconnectServer);
    const getServerInfo = registeredHandlers.get(IpcChannel.GetServerInfo);
    const listConnections = registeredHandlers.get(IpcChannel.ListConnections);
    const deleteConnection = registeredHandlers.get(IpcChannel.DeleteConnection);
    const deleteAllConnections = registeredHandlers.get(IpcChannel.DeleteAllConnections);
    const setFavorite = registeredHandlers.get(IpcChannel.SetFavoriteConnection);
    const listTools = registeredHandlers.get(IpcChannel.ListTools);
    const callTool = registeredHandlers.get(IpcChannel.CallTool);
    const listResources = registeredHandlers.get(IpcChannel.ListResources);
    const readResource = registeredHandlers.get(IpcChannel.ReadResource);
    const listPrompts = registeredHandlers.get(IpcChannel.ListPrompts);
    const getPrompt = registeredHandlers.get(IpcChannel.GetPrompt);
    const getHistory = registeredHandlers.get(IpcChannel.GetHistory);
    const listCollections = registeredHandlers.get(IpcChannel.ListCollections);
    const startMock = registeredHandlers.get(IpcChannel.StartMock);
    const stopMock = registeredHandlers.get(IpcChannel.StopMock);
    const getSettings = registeredHandlers.get(IpcChannel.GetSettings);

    const connected = await connect?.(
      {},
      { type: "http", name: "Registry", url: "https://example.com" }
    );
    const info = await getServerInfo?.({});
    const connections = await listConnections?.({});
    const deleted = await deleteConnection?.({}, "conn-1");
    const deletedAll = await deleteAllConnections?.({});
    const favorite = await setFavorite?.({}, "conn-1", true);
    const tools = await listTools?.({});
    const toolResult = await callTool?.({}, "search", { q: "mcp" });
    const resources = await listResources?.({});
    const resource = await readResource?.({}, "resource://docs");
    const prompts = await listPrompts?.({});
    const prompt = await getPrompt?.({}, "review", { limit: 2, exact: true });
    const history = await getHistory?.({});
    const collections = await listCollections?.({});
    const mockStart = await startMock?.({});
    const mockStop = await stopMock?.({});
    const settings = await getSettings?.({});
    const disconnected = await disconnect?.({});
    const disconnectedInfo = await getServerInfo?.({});

    expect(ipcHandle).toHaveBeenCalled();
    expect(connected).toMatchObject({
      success: true,
      serverInfo: { name: "Registry", version: "1.0.0" },
    });
    expect(StreamableHTTPTransportMock).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(db.saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: "Registry",
        type: "http",
        endpoint: "https://example.com",
        favorite: false,
      })
    );
    expect(info).toMatchObject({ connected: true });
    expect(connections).toEqual([{ id: "conn-1" }]);
    expect(deleted).toEqual({ success: true });
    expect(db.deleteConnection).toHaveBeenCalledWith("conn-1");
    expect(deletedAll).toEqual({ success: true, deleted: 3 });
    expect(db.deleteAllConnections).toHaveBeenCalled();
    expect(favorite).toEqual({ id: "conn-1", favorite: true });
    expect(tools).toEqual({ tools: [{ name: "search" }] });
    expect(toolResult).toEqual({
      result: { isError: false, content: [{ type: "text", text: "ok" }] },
      latency: expect.any(Number),
    });
    expect(db.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "search",
        isError: false,
      })
    );
    expect(resources).toEqual({ resources: [{ uri: "resource://docs" }] });
    expect(resource).toEqual({ uri: "resource://docs", text: "hello" });
    expect(prompts).toEqual({ prompts: [{ name: "review" }] });
    expect(prompt).toEqual({ name: "review", messages: [] });
    expect(client.getPrompt).toHaveBeenCalledWith("review", {
      limit: "2",
      exact: "true",
    });
    expect(history).toEqual([{ id: "call-1" }]);
    expect(collections).toEqual([{ id: "collection-1" }]);
    expect(mockStart).toEqual({ success: true, port: 4001 });
    expect(mockStop).toEqual({ success: true });
    expect(settings).toEqual({
      theme: "system",
      activeConnectionId: expect.any(String),
    });
    expect(disconnected).toEqual({ success: true });
    expect(client.disconnect).toHaveBeenCalled();
    expect(disconnectedInfo).toEqual({ connected: false });
  });

  it("supports stdio transport and returns helpful failures for invalid states", async () => {
    client.connect.mockResolvedValue({
      serverInfo: { name: "Local", version: "1.0.0" },
      capabilities: {},
    });
    client.disconnect.mockResolvedValue(undefined);
    spawnMock.mockReturnValue({
      stdout: {},
      stdin: {},
      kill: killMock,
      on: vi.fn(),
    });

    const db = createDatabaseMock();
    const { registerHandlers, IpcChannel } = await loadHandlersModule();
    registerHandlers(db as never, null);

    const connect = registeredHandlers.get(IpcChannel.ConnectServer);
    const callTool = registeredHandlers.get(IpcChannel.CallTool);
    const disconnect = registeredHandlers.get(IpcChannel.DisconnectServer);

    await expect(callTool?.({}, "search", { q: "mcp" })).rejects.toThrow("Not connected");

    const connected = await connect?.(
      {},
      {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        name: undefined,
        url: undefined,
      }
    );
    const disconnected = await disconnect?.({});

    expect(connected).toMatchObject({ success: true });
    expect(spawnMock).toHaveBeenCalledWith(
      "node",
      ["server.js"],
      expect.objectContaining({
        env: expect.any(Object),
        windowsHide: true,
      })
    );
    expect(StdioTransportMock).toHaveBeenCalled();
    expect(disconnected).toEqual({ success: true });
    expect(killMock).toHaveBeenCalled();
  });

  it("returns empty resources and prompts when server does not implement those methods", async () => {
    const methodNotFound = Object.assign(new Error("Method not found"), { code: -32601 });
    client.connect.mockResolvedValue({
      serverInfo: { name: "Local", version: "1.0.0" },
      capabilities: {},
    });
    client.listResources.mockRejectedValue(methodNotFound);
    client.listPrompts.mockRejectedValue(methodNotFound);
    spawnMock.mockReturnValue({
      stdout: {},
      stdin: {},
      kill: killMock,
      on: vi.fn(),
    });

    const db = createDatabaseMock();
    const { registerHandlers, IpcChannel } = await loadHandlersModule();
    registerHandlers(db as never, null);

    const connect = registeredHandlers.get(IpcChannel.ConnectServer);
    const listResources = registeredHandlers.get(IpcChannel.ListResources);
    const listPrompts = registeredHandlers.get(IpcChannel.ListPrompts);

    await connect?.(
      {},
      {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        name: undefined,
        url: undefined,
      }
    );

    await expect(listResources?.({})).resolves.toEqual({ resources: [] });
    await expect(listPrompts?.({})).resolves.toEqual({ prompts: [] });
  });

  it("returns structured errors when connection setup fails", async () => {
    client.connect.mockRejectedValueOnce(new Error("boom"));

    const db = createDatabaseMock();
    const { registerHandlers, IpcChannel } = await loadHandlersModule();
    registerHandlers(db as never, null);

    const connect = registeredHandlers.get(IpcChannel.ConnectServer);
    const result = await connect?.(
      {},
      {
        type: "http",
        name: "Broken",
        url: "https://broken.example.com",
        command: undefined,
        args: undefined,
      }
    );

    expect(result).toEqual({
      success: false,
      error: "boom",
    });
  });
});
