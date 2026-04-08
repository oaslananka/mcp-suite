import { afterEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const disconnectMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const spawnMock = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn()
}));

vi.mock("child_process", () => ({
  spawn: spawnMock
}));

vi.mock("@oaslananka/shared", () => {
  const MCPClient = vi.fn().mockImplementation(function MockMCPClient(transport: unknown, options: unknown) {
    return {
      transport,
      options,
      connect: connectMock,
      disconnect: disconnectMock
    };
  });

  const StreamableHTTPTransport = vi.fn().mockImplementation(function MockStreamableHTTPTransport(options: unknown) {
    return { kind: "http", options };
  });

  const StdioTransport = vi.fn().mockImplementation(function MockStdioTransport(stdout: unknown, stdin: unknown) {
    return { kind: "stdio", stdout, stdin };
  });

  return {
    MCPClient,
    StreamableHTTPTransport,
    StdioTransport,
    logger
  };
});

import { MCPClient, StdioTransport, StreamableHTTPTransport } from "@oaslananka/shared";
import { ConnectionManager } from "../src/connections/ConnectionManager.js";

describe("ConnectionManager", () => {
  afterEach(() => {
    connectMock.mockClear();
    disconnectMock.mockClear();
    spawnMock.mockReset();
    logger.info.mockClear();
    logger.error.mockClear();
    vi.clearAllMocks();
  });

  it("creates cached HTTP clients and wires auth headers", async () => {
    const manager = new ConnectionManager();

    const client = await manager.getClient("registry", {
      transport: "http",
      url: "https://registry.example.com",
      auth: {
        type: "basic",
        username: "ada",
        password: "secret"
      }
    });
    const cached = await manager.getClient("registry", {
      transport: "http",
      url: "https://registry.example.com"
    });

    expect(cached).toBe(client);
    expect(StreamableHTTPTransport).toHaveBeenCalledWith({
      url: "https://registry.example.com",
      headers: {
        Authorization: `Basic ${Buffer.from("ada:secret").toString("base64")}`
      }
    });
    expect(MCPClient).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("creates stdio clients, tracks child processes, and shuts everything down", async () => {
    const kill = vi.fn();
    spawnMock.mockReturnValue({
      stdout: {},
      stdin: {},
      on: vi.fn(),
      kill
    });

    const manager = new ConnectionManager();
    await manager.getClient("local", {
      transport: "stdio",
      command: "node server.js --port 4000"
    });
    await manager.shutdown();

    expect(spawnMock).toHaveBeenCalledWith("node", ["server.js", "--port", "4000"], {
      env: process.env
    });
    expect(StdioTransport).toHaveBeenCalled();
    expect(disconnectMock).toHaveBeenCalled();
    expect(kill).toHaveBeenCalled();
  });

  it("rejects invalid connection configurations and supports no-op release", async () => {
    const manager = new ConnectionManager();

    await expect(
      manager.getClient("missing-url", {
        transport: "http"
      } as never)
    ).rejects.toThrow("Server missing-url is missing URL for HTTP transport");
    await expect(
      manager.getClient("missing-command", {
        transport: "stdio"
      } as never)
    ).rejects.toThrow("Server missing-command is missing command for STDIO transport");
    await expect(
      manager.getClient("unknown", {
        transport: "ssh"
      } as never)
    ).rejects.toThrow("Unknown transport ssh");

    await expect(manager.releaseClient("registry", {} as never)).resolves.toBeUndefined();
  });
});
