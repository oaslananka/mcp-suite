import { PassThrough } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn(async () => undefined);
const disconnectMock = vi.fn(async () => undefined);
const killMock = vi.fn();
const spawnMock = vi.fn(() => ({
  stdout: new PassThrough(),
  stdin: new PassThrough(),
  kill: killMock,
}));

const httpTransportCtor = vi.fn();
const stdioTransportCtor = vi.fn();

vi.mock("@oaslananka/shared", () => ({
  MCPClient: class {
    constructor(public readonly transport: unknown, public readonly options: unknown) {}
    connect = connectMock;
    disconnect = disconnectMock;
  },
  StreamableHTTPTransport: class {
    constructor(public readonly options: unknown) {
      httpTransportCtor(options);
    }
  },
  StdioTransport: class {
    constructor(public readonly stdout: unknown, public readonly stdin: unknown) {
      stdioTransportCtor({ stdout, stdin });
    }
  },
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("BackendManager", () => {
  afterEach(() => {
    connectMock.mockClear();
    disconnectMock.mockClear();
    killMock.mockClear();
    spawnMock.mockClear();
    httpTransportCtor.mockClear();
    stdioTransportCtor.mockClear();
  });

  it("connects HTTP backends and exposes them through the client list", async () => {
    const { BackendManager } = await import("../src/backends/BackendManager.js");
    const manager = new BackendManager();

    await manager.addBackend("atlas", {
      transport: "http",
      url: "https://atlas.example.com/mcp",
    });

    expect(httpTransportCtor).toHaveBeenCalledWith({ url: "https://atlas.example.com/mcp" });
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(manager.listClients()).toEqual([{ name: "atlas", status: "connected" }]);
    expect(manager.getClient("atlas")).not.toBeNull();

    await manager.removeBackend("atlas");
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("connects stdio backends, validates required fields, and can reconnect", async () => {
    const { BackendManager } = await import("../src/backends/BackendManager.js");
    const manager = new BackendManager();

    await expect(manager.addBackend("broken-http", { transport: "http" })).rejects.toThrow("missing url");
    await expect(manager.addBackend("broken-stdio", { transport: "stdio" })).rejects.toThrow("missing command");

    await manager.addBackend("filesystem", {
      transport: "stdio",
      command: "node server.js",
      env: { TOKEN: "secret" },
    });

    expect(spawnMock).toHaveBeenCalledWith("node server.js", [], expect.objectContaining({
      env: expect.objectContaining({ TOKEN: "secret" }),
    }));
    expect(stdioTransportCtor).toHaveBeenCalledTimes(1);

    await manager.reconnectAll();
    expect(connectMock).toHaveBeenCalledTimes(2);

    await manager.removeBackend("filesystem");
    expect(killMock).toHaveBeenCalled();
  });
});
