import { afterEach, describe, expect, it, vi } from "vitest";

const exposeInMainWorld = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const on = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
  },
}));

import { IpcChannel } from "../src/main/ipc/channels.js";
import { api } from "../src/preload/index.js";

describe("preload api", () => {
  afterEach(() => {
    exposeInMainWorld.mockClear();
    invoke.mockReset();
    on.mockReset();
    vi.clearAllMocks();
  });

  it("exposes the preload API to the renderer", () => {
    expect(exposeInMainWorld).toHaveBeenCalledWith("labApi", api);
  });

  it("routes invoke-based API calls through typed IPC channels", async () => {
    invoke.mockResolvedValue({ success: true });

    await api.connectServer({ type: "http", url: "https://example.com" });
    await api.disconnectServer();
    await api.getServerInfo();
    await api.listConnections();
    await api.deleteConnection("conn-1");
    await api.deleteAllConnections();
    await api.setFavoriteConnection("conn-1", true);
    await api.listTools();
    await api.callTool("search", { q: "mcp" });
    await api.listResources();
    await api.readResource("resource://docs");
    await api.subscribeResource("resource://docs");
    await api.listPrompts();
    await api.getPrompt("review", { count: 2 });
    await api.listHistory();
    await api.listCollections();
    await api.startMock({ mode: "record" });
    await api.stopMock();
    await api.getSettings();

    expect(invoke).toHaveBeenNthCalledWith(1, IpcChannel.ConnectServer, {
      type: "http",
      url: "https://example.com",
    });
    expect(invoke).toHaveBeenNthCalledWith(5, IpcChannel.DeleteConnection, "conn-1");
    expect(invoke).toHaveBeenNthCalledWith(6, IpcChannel.DeleteAllConnections);
    expect(invoke).toHaveBeenNthCalledWith(8, IpcChannel.ListTools);
    expect(invoke).toHaveBeenNthCalledWith(9, IpcChannel.CallTool, "search", { q: "mcp" });
    expect(invoke).toHaveBeenNthCalledWith(13, IpcChannel.ListPrompts);
    expect(invoke).toHaveBeenNthCalledWith(14, IpcChannel.GetPrompt, "review", { count: 2 });
    expect(invoke).toHaveBeenNthCalledWith(18, IpcChannel.StopMock);
    expect(invoke).toHaveBeenNthCalledWith(19, IpcChannel.GetSettings);
  });

  it("forwards update and deep-link events to renderer listeners", () => {
    const updateListener = vi.fn();
    const downloadedListener = vi.fn();
    const deepLinkListener = vi.fn();

    api.onUpdateAvailable(updateListener);
    api.onUpdateDownloaded(downloadedListener);
    api.onDeepLinkOpened(deepLinkListener);

    const updateHandler = on.mock.calls[0]?.[1];
    const downloadedHandler = on.mock.calls[1]?.[1];
    const deepLinkHandler = on.mock.calls[2]?.[1];

    updateHandler?.({}, { version: "1.0.0" });
    downloadedHandler?.({}, { version: "1.0.0" });
    deepLinkHandler?.({}, 42);

    expect(on).toHaveBeenNthCalledWith(1, IpcChannel.UpdateAvailable, expect.any(Function));
    expect(on).toHaveBeenNthCalledWith(2, IpcChannel.UpdateDownloaded, expect.any(Function));
    expect(on).toHaveBeenNthCalledWith(3, IpcChannel.DeepLinkOpened, expect.any(Function));
    expect(updateListener).toHaveBeenCalledWith({ version: "1.0.0" });
    expect(downloadedListener).toHaveBeenCalledWith({ version: "1.0.0" });
    expect(deepLinkListener).toHaveBeenCalledWith("42");
  });
});
