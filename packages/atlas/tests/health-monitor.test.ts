import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import Database from "better-sqlite3";
import { SafeFetchError, type SafeFetchResult } from "@oaslananka/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthMonitor } from "../src/registry/HealthMonitor.js";
import {
  ServerStore,
  type MCPHealthConfig,
  type MCPServerRecord,
} from "../src/registry/ServerStore.js";

const temporaryDirectories: string[] = [];

function createStore(): ServerStore {
  return new ServerStore(new Database(":memory:"));
}

function addServer(store: ServerStore, healthConfig?: MCPHealthConfig): MCPServerRecord {
  return store.add({
    name: `Health Target ${Math.random()}`,
    packageName: "@example/health-target",
    version: "1.0.0",
    description: "Protocol-aware health test target",
    author: "Tests",
    transport: healthConfig ? [healthConfig.transport] : ["http"],
    tags: ["health"],
    installCommand: "not-used",
    ...(healthConfig ? { healthConfig } : {}),
    license: "MIT",
    verified: true,
    downloads: 0,
    rating: 0,
  });
}

function httpResult(
  body: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {}
): SafeFetchResult {
  return {
    bodyText: typeof body === "string" ? body : JSON.stringify(body),
    finalUrl: new URL("https://mcp.example.com/mcp"),
    headers: new Headers(options.headers ?? {}) as unknown as SafeFetchResult["headers"],
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.ok === false ? "Failure" : "OK",
  };
}

function initializeResponse(
  protocolVersion = "2025-11-25",
  capabilities: Record<string, unknown> = { tools: { listChanged: false } }
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion,
      capabilities,
      serverInfo: { name: "health-target", version: "1.0.0" },
    },
  };
}

function toolsResponse(): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 2,
    result: { tools: [{ name: "ping", inputSchema: { type: "object" } }] },
  };
}

function createStdioScript(source: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "atlas-stdio-probe-"));
  temporaryDirectories.push(directory);
  const script = path.join(directory, "server.mjs");
  writeFileSync(script, source, "utf8");
  return script;
}

type MockStdioChild = ChildProcessWithoutNullStreams & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
};

type MockStdioAction = (child: MockStdioChild) => void;

function createMockStdioChild(action?: MockStdioAction): MockStdioChild {
  const child = new EventEmitter() as MockStdioChild;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let exited = false;

  Object.assign(child, {
    stdin,
    stdout,
    stderr,
    pid: 1,
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: process.execPath,
    kill(signal = "SIGTERM") {
      if (!exited) {
        exited = true;
        queueMicrotask(() => child.emit("exit", null, signal));
      }
      return true;
    },
  });

  if (action) {
    stdin.once("data", () => queueMicrotask(() => action(child)));
  }
  return child;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("HealthMonitor MCP readiness", () => {
  it("performs bounded HTTP initialize and tools/list against the configured MCP endpoint", async () => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
      headersFromEnv: { authorization: "ATLAS_TEST_MCP_TOKEN" },
      timeoutMs: 500,
    });
    process.env["ATLAS_TEST_MCP_TOKEN"] = "Bearer health-secret";
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce(
        httpResult(initializeResponse(), { headers: { "mcp-session-id": "session-1" } })
      )
      .mockResolvedValueOnce(httpResult("", { status: 202 }))
      .mockResolvedValueOnce(httpResult(toolsResponse()));
    const monitor = new HealthMonitor(store, { fetchText: fetchText as never });

    const result = await monitor.checkServer(server.id);

    expect(result).toMatchObject({
      status: "online",
      liveness: "reachable",
      readiness: "ready",
      capabilityStatus: "verified",
      negotiatedProtocolVersion: "2025-11-25",
      toolCount: 1,
    });
    expect(fetchText).toHaveBeenCalledTimes(3);
    expect(fetchText.mock.calls[0]?.[0]).toBe("https://mcp.example.com/mcp");
    expect(JSON.parse(fetchText.mock.calls[0]?.[1].body as string)).toMatchObject({
      method: "initialize",
    });
    expect(JSON.parse(fetchText.mock.calls[1]?.[1].body as string)).toMatchObject({
      method: "notifications/initialized",
    });
    expect(fetchText.mock.calls[2]?.[1].headers).toMatchObject({
      authorization: "Bearer health-secret",
      "MCP-Protocol-Version": "2025-11-25",
      "Mcp-Session-Id": "session-1",
    });
    expect(store.findById(server.id)?.health).toMatchObject({ readiness: "ready" });
    expect(store.findById(server.id)?.qualityScore).toBe(40);
    delete process.env["ATLAS_TEST_MCP_TOKEN"];
  });

  it("supports JSON-RPC delivered as server-sent event data", async () => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
    });
    const fetchText = vi
      .fn()
      .mockResolvedValue(
        httpResult(
          `event: message\ndata: ${JSON.stringify(initializeResponse("2025-11-25", {}))}\n\n`
        )
      );
    const result = await new HealthMonitor(store, { fetchText: fetchText as never }).checkServer(
      server.id
    );
    expect(result).toMatchObject({
      status: "online",
      readiness: "ready",
      capabilityStatus: "not_supported",
    });
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "incompatible protocol",
      response: initializeResponse("2099-01-01"),
      category: "incompatible_protocol",
    },
    { name: "malformed response", response: "not-json", category: "malformed_response" },
    {
      name: "initialize error",
      response: { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "boom" } },
      category: "initialize_failed",
    },
  ])(
    "marks reachable but unready HTTP targets as degraded: $name",
    async ({ response, category }) => {
      const store = createStore();
      const server = addServer(store, {
        transport: "http",
        url: "https://mcp.example.com/mcp",
      });
      const fetchText = vi.fn().mockResolvedValue(httpResult(response));
      const result = await new HealthMonitor(store, { fetchText: fetchText as never }).checkServer(
        server.id
      );
      expect(result).toMatchObject({
        status: "degraded",
        liveness: "reachable",
        readiness: "not_ready",
        failureCategory: category,
      });
    }
  );

  it("blocks private HTTP targets through the shared URL policy", async () => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://127.0.0.1/mcp",
    });
    const result = await new HealthMonitor(store).checkServer(server.id);
    expect(result).toMatchObject({
      status: "offline",
      liveness: "unreachable",
      readiness: "not_ready",
      failureCategory: "policy_blocked",
    });
  });

  it("preserves the last successful MCP readiness timestamp after a later timeout", async () => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
    });
    const now = new Date("2026-07-20T21:00:00.000Z");
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce(httpResult(initializeResponse("2025-11-25", {})))
      .mockResolvedValueOnce(httpResult("", { status: 202 }))
      .mockRejectedValueOnce(new SafeFetchError("Atlas MCP health policy: request timed out"));
    const monitor = new HealthMonitor(store, { fetchText: fetchText as never, now: () => now });
    await monitor.checkServer(server.id);
    const failed = await monitor.checkServer(server.id);
    expect(failed).toMatchObject({
      failureCategory: "timeout",
      lastSuccessfulAt: now,
    });
    expect(monitor.getUptime(server.id, 1)).toBe(50);
  });

  it("performs a direct no-shell stdio initialize and tools/list handshake", async () => {
    const script = createStdioScript(`
      import readline from "node:readline";
      const lines = readline.createInterface({ input: process.stdin });
      lines.on("line", (line) => {
        const message = JSON.parse(line);
        if (message.method === "initialize") {
          process.stdout.write(JSON.stringify(${JSON.stringify(initializeResponse())}) + "\\n");
        } else if (message.method === "tools/list") {
          process.stdout.write(JSON.stringify(${JSON.stringify(toolsResponse())}) + "\\n");
        }
      });
    `);
    const store = createStore();
    const server = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: [script],
      timeoutMs: 1_000,
    });
    const result = await new HealthMonitor(store, {
      allowedStdioCommands: [process.execPath],
    }).checkServer(server.id);
    expect(result).toMatchObject({
      status: "online",
      readiness: "ready",
      capabilityStatus: "verified",
      toolCount: 1,
    });
  });

  it.each([
    {
      name: "malformed output",
      action: (child: MockStdioChild) => child.stdout.write("not-json\n"),
      category: "malformed_response",
    },
    {
      name: "failed command",
      action: (child: MockStdioChild) => child.emit("exit", 2, null),
      category: "command_failed",
    },
    {
      name: "stderr output limit",
      action: (child: MockStdioChild) => child.stderr.write("x".repeat(2_000)),
      category: "output_limit",
      maxOutputBytes: 128,
    },
    {
      name: "timeout",
      action: undefined,
      category: "timeout",
    },
    {
      name: "output limit",
      action: (child: MockStdioChild) => child.stdout.write(`${"x".repeat(2_000)}\n`),
      category: "output_limit",
      maxOutputBytes: 128,
    },
  ])("classifies bounded stdio failures: $name", async ({ action, category, maxOutputBytes }) => {
    const store = createStore();
    const server = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: [],
      timeoutMs: 50,
      ...(maxOutputBytes ? { maxOutputBytes } : {}),
    });
    const child = createMockStdioChild(action);
    const spawnProcess = vi.fn(() => child);
    const result = await new HealthMonitor(store, {
      allowedStdioCommands: [process.execPath],
      spawnProcess: spawnProcess as never,
    }).checkServer(server.id);
    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ readiness: "not_ready", failureCategory: category });
  });

  it("force-kills a stdio process that ignores graceful termination after timeout", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "atlas-stdio-kill-"));
    temporaryDirectories.push(directory);
    const pidFile = path.join(directory, "pid.txt");
    const script = path.join(directory, "server.mjs");
    writeFileSync(
      script,
      `
        import { writeFileSync } from "node:fs";
        writeFileSync(process.argv[2], String(process.pid));
        process.on("SIGTERM", () => {});
        process.stdin.resume();
      `,
      "utf8"
    );
    const child = spawn(process.execPath, [script, pidFile], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    await vi.waitFor(() => expect(existsSync(pidFile)).toBe(true), { timeout: 5_000 });
    const pid = Number(readFileSync(pidFile, "utf8"));
    const spawnProcess = vi.fn(() => child);
    const store = createStore();
    const server = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: [script, pidFile],
      timeoutMs: 200,
    });

    try {
      await expect(
        new HealthMonitor(store, {
          allowedStdioCommands: [process.execPath],
          spawnProcess: spawnProcess as never,
        }).checkServer(server.id)
      ).resolves.toMatchObject({ failureCategory: "timeout" });
      expect(spawnProcess).toHaveBeenCalledOnce();
      await vi.waitFor(
        () => {
          expect(() => process.kill(pid, 0)).toThrow();
        },
        { timeout: 3_000 }
      );
    } finally {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The expected path already reaped the child.
      }
    }
  });

  it("fails closed for missing configuration and non-allowlisted stdio commands", async () => {
    const store = createStore();
    const unconfigured = addServer(store);
    const command = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: ["missing.mjs"],
    });
    const monitor = new HealthMonitor(store);
    await expect(monitor.checkServer(unconfigured.id)).resolves.toMatchObject({
      failureCategory: "unconfigured",
    });
    await expect(monitor.checkServer(command.id)).resolves.toMatchObject({
      failureCategory: "command_not_allowed",
    });
  });

  it("handles empty uptime windows, missing records, and scheduler cleanup", async () => {
    const store = createStore();
    const monitor = new HealthMonitor(store);

    expect(monitor.getUptime("missing", 1)).toBe(0);
    expect(() => monitor.getUptime("missing", 0)).toThrow("uptime days must be a positive integer");
    await expect(monitor.checkServer("missing")).rejects.toThrow("Server not found");

    await monitor.start(60_000);
    await monitor.stop();
    await monitor.stop();
    await expect(monitor.start(0)).rejects.toThrow("health interval must be a positive integer");
  });

  it.each([
    {
      name: "initialize HTTP failure",
      responses: [httpResult("unavailable", { ok: false, status: 503 })],
      category: "transport_error",
    },
    {
      name: "initialized notification failure",
      responses: [
        httpResult(initializeResponse("2025-11-25", {})),
        httpResult("rejected", { ok: false, status: 500 }),
      ],
      category: "initialize_failed",
    },
    {
      name: "tools HTTP failure",
      responses: [
        httpResult(initializeResponse()),
        httpResult("", { status: 202 }),
        httpResult("unavailable", { ok: false, status: 503 }),
      ],
      category: "capability_failed",
    },
    {
      name: "tools JSON-RPC failure",
      responses: [
        httpResult(initializeResponse()),
        httpResult("", { status: 202 }),
        httpResult({ jsonrpc: "2.0", id: 2, error: { code: -32603, message: "boom" } }),
      ],
      category: "capability_failed",
    },
  ])("classifies HTTP lifecycle failures: $name", async ({ responses, category }) => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
    });
    const fetchText = vi.fn();
    for (const response of responses) fetchText.mockResolvedValueOnce(response);

    await expect(
      new HealthMonitor(store, { fetchText: fetchText as never }).checkServer(server.id)
    ).resolves.toMatchObject({ readiness: "not_ready", failureCategory: category });
  });

  it("keeps HTTP liveness reachable when tools verification times out after initialize", async () => {
    const store = createStore();
    const server = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
    });
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce(httpResult(initializeResponse()))
      .mockResolvedValueOnce(httpResult("", { status: 202 }))
      .mockRejectedValueOnce(new SafeFetchError("Atlas MCP health policy: request timed out"));

    await expect(
      new HealthMonitor(store, { fetchText: fetchText as never }).checkServer(server.id)
    ).resolves.toMatchObject({
      status: "degraded",
      liveness: "reachable",
      readiness: "not_ready",
      failureCategory: "timeout",
    });
  });

  it("keeps stdio liveness reachable when tools verification times out after initialize", async () => {
    const script = createStdioScript(`
      import readline from "node:readline";
      const lines = readline.createInterface({ input: process.stdin });
      lines.on("line", (line) => {
        const message = JSON.parse(line);
        if (message.method === "initialize") {
          process.stdout.write(JSON.stringify(${JSON.stringify(initializeResponse())}) + "\\n");
        }
      });
    `);
    const store = createStore();
    const server = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: [script],
      // Allow the child runtime to start under the fully parallel workspace coverage job.
      // The assertion still exercises the post-initialize tools/list timeout.
      timeoutMs: 2_000,
    });

    await expect(
      new HealthMonitor(store, { allowedStdioCommands: [process.execPath] }).checkServer(server.id)
    ).resolves.toMatchObject({
      status: "degraded",
      liveness: "reachable",
      readiness: "not_ready",
      failureCategory: "timeout",
    });
  });

  it("classifies generic HTTP failures and missing credential environments", async () => {
    const store = createStore();
    const transportFailure = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
    });
    const missingCredential = addServer(store, {
      transport: "http",
      url: "https://mcp.example.com/mcp",
      headersFromEnv: { authorization: "ATLAS_MISSING_HEALTH_TOKEN" },
    });

    await expect(
      new HealthMonitor(store, {
        fetchText: vi.fn().mockRejectedValue(new Error("network failure")) as never,
      }).checkServer(transportFailure.id)
    ).resolves.toMatchObject({
      status: "offline",
      liveness: "unreachable",
      failureCategory: "transport_error",
    });
    await expect(new HealthMonitor(store).checkServer(missingCredential.id)).resolves.toMatchObject(
      {
        liveness: "unknown",
        failureCategory: "unconfigured",
      }
    );
  });

  it("initializes stdio servers without tools using explicitly mapped environment", async () => {
    process.env["ATLAS_STDIO_HEALTH_TOKEN"] = "mapped-secret";
    const script = createStdioScript(`
      import readline from "node:readline";
      const lines = readline.createInterface({ input: process.stdin });
      lines.on("line", (line) => {
        const message = JSON.parse(line);
        if (message.method === "initialize" && process.env.HEALTH_TOKEN === "mapped-secret") {
          process.stdout.write(JSON.stringify(${JSON.stringify(initializeResponse("2025-11-25", {}))}) + "\\n");
        }
      });
    `);
    const store = createStore();
    const server = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: [script],
      envFrom: { HEALTH_TOKEN: "ATLAS_STDIO_HEALTH_TOKEN" },
      timeoutMs: 1_000,
    });

    await expect(
      new HealthMonitor(store, { allowedStdioCommands: [process.execPath] }).checkServer(server.id)
    ).resolves.toMatchObject({
      status: "online",
      readiness: "ready",
      capabilityStatus: "not_supported",
    });
    delete process.env["ATLAS_STDIO_HEALTH_TOKEN"];
  });

  it("fails closed for invalid stdio arguments and missing mapped environment", async () => {
    const store = createStore();
    const invalidArguments = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: Array.from({ length: 101 }, () => "argument"),
    });
    const missingEnvironment = addServer(store, {
      transport: "stdio",
      command: process.execPath,
      args: ["missing.mjs"],
      envFrom: { HEALTH_TOKEN: "ATLAS_MISSING_STDIO_TOKEN" },
    });
    const monitor = new HealthMonitor(store, { allowedStdioCommands: [process.execPath] });

    await expect(monitor.checkServer(invalidArguments.id)).resolves.toMatchObject({
      failureCategory: "unconfigured",
    });
    await expect(monitor.checkServer(missingEnvironment.id)).resolves.toMatchObject({
      failureCategory: "unconfigured",
    });
  });
});
