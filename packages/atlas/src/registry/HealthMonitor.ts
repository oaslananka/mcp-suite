import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import {
  isSupportedProtocolVersion,
  LATEST_PROTOCOL_VERSION,
  logger,
  safeFetchText,
  SafeFetchError,
  UrlPolicyError,
  type SafeFetchResult,
} from "@oaslananka/shared";
import type {
  ServerStore,
  MCPHealthConfig,
  MCPHealthFailureCategory,
  MCPHealthSnapshot,
  MCPHttpHealthConfig,
  MCPStdioHealthConfig,
} from "./ServerStore.js";

export interface HealthCheckResult extends MCPHealthSnapshot {
  serverId: string;
}

export interface HealthMonitorOptions {
  allowedStdioCommands?: string[];
  fetchText?: typeof safeFetchText;
  now?: () => Date;
  spawnProcess?: typeof spawn;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
}

const HTTP_CONTENT_TYPES = ["application/json", "text/event-stream"];
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const RESERVED_MCP_HEADERS = new Set([
  "host",
  "content-length",
  "content-type",
  "accept",
  "mcp-protocol-version",
  "mcp-session-id",
]);

export class HealthMonitor {
  private intervalId: NodeJS.Timeout | undefined;
  private readonly allowedStdioCommands: Set<string>;
  private readonly fetchText: typeof safeFetchText;
  private readonly now: () => Date;
  private readonly spawnProcess: typeof spawn;

  constructor(
    private readonly store: ServerStore,
    options: HealthMonitorOptions = {}
  ) {
    this.allowedStdioCommands = new Set(options.allowedStdioCommands ?? []);
    this.fetchText = options.fetchText ?? safeFetchText;
    this.now = options.now ?? (() => new Date());
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async start(intervalMs = 900_000): Promise<void> {
    this.intervalId = setInterval(
      () => {
        void this.checkAll().catch((error: unknown) =>
          logger.error({ err: error }, "Health check failed")
        );
      },
      positiveInteger(intervalMs, "health interval")
    );
    this.intervalId.unref();
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async checkAll(): Promise<void> {
    logger.info("Running MCP readiness checks for all verified servers");
    const servers = this.store.search("", { verified: true }).items;
    for (const server of servers) {
      await this.checkServer(server.id);
    }
  }

  async checkServer(serverId: string): Promise<HealthCheckResult> {
    const server = this.store.findById(serverId);
    if (!server) throw new Error("Server not found");

    const startedAt = Date.now();
    const checkedAt = this.now();
    let snapshot: MCPHealthSnapshot;
    try {
      if (!server.healthConfig) {
        throw new ProbeFailure("unconfigured", "unknown", "MCP probe configuration is missing");
      }
      snapshot = await this.probe(server.healthConfig, checkedAt, startedAt);
    } catch (error: unknown) {
      const failure = normalizeProbeFailure(error);
      const lastSuccessfulAt = this.store.getLastSuccessfulAt(serverId);
      snapshot = {
        status: failure.liveness === "reachable" ? "degraded" : "offline",
        liveness: failure.liveness,
        readiness: "not_ready",
        capabilityStatus: "not_checked",
        responseMs: Date.now() - startedAt,
        checkedAt,
        ...(lastSuccessfulAt ? { lastSuccessfulAt } : {}),
        failureCategory: failure.category,
        failureMessage: failure.message,
      };
      logger.warn({ serverId, failureCategory: failure.category }, "MCP readiness check failed");
    }

    this.store.recordHealthCheck(serverId, snapshot);
    return { serverId, ...snapshot };
  }

  getUptime(serverId: string, days: number): number {
    const windowStart = new Date(Date.now() - positiveInteger(days, "uptime days") * 86_400_000);
    const rows = this.store.db
      .prepare(
        `SELECT readiness FROM health_checks
         WHERE server_id = ? AND COALESCE(checked_at, created_at) >= ?`
      )
      .all(serverId, windowStart.toISOString()) as Array<{ readiness: string }>;
    if (rows.length === 0) return 0;
    const ready = rows.filter((row) => row.readiness === "ready").length;
    return Number(((ready / rows.length) * 100).toFixed(2));
  }

  private async probe(
    config: MCPHealthConfig,
    checkedAt: Date,
    startedAt: number
  ): Promise<MCPHealthSnapshot> {
    const handshake =
      config.transport === "http" ? await this.probeHttp(config) : await this.probeStdio(config);
    const protocolVersion = readInitializeResult(handshake.initialize).protocolVersion;
    if (!isSupportedProtocolVersion(protocolVersion)) {
      throw new ProbeFailure(
        "incompatible_protocol",
        "reachable",
        "MCP server negotiated an unsupported protocol version"
      );
    }

    const initializeResult = readInitializeResult(handshake.initialize);
    let capabilityStatus: MCPHealthSnapshot["capabilityStatus"] = "not_supported";
    let toolCount: number | undefined;
    if (hasToolsCapability(initializeResult.capabilities)) {
      if (!handshake.tools) {
        throw new ProbeFailure(
          "capability_failed",
          "reachable",
          "MCP tools capability was advertised but tools/list was not verified"
        );
      }
      toolCount = readToolCount(handshake.tools);
      capabilityStatus = "verified";
    }

    const responseMs = Date.now() - startedAt;
    return {
      status: "online",
      liveness: "reachable",
      readiness: "ready",
      capabilityStatus,
      responseMs,
      checkedAt,
      lastSuccessfulAt: checkedAt,
      negotiatedProtocolVersion: protocolVersion,
      ...(toolCount !== undefined ? { toolCount } : {}),
    };
  }

  private async probeHttp(config: MCPHttpHealthConfig): Promise<ProbeHandshake> {
    const timeoutMs = positiveInteger(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, "HTTP timeout");
    const maxResponseBytes = positiveInteger(
      config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "HTTP response limit"
    );
    const headers = resolveHeadersFromEnvironment(config.headersFromEnv);
    const initialize = await this.fetchJsonRpc(config.url, initializeRequest(1), {
      ...config,
      headers,
      timeoutMs,
      maxResponseBytes,
    });
    if (!initialize.response.ok) {
      throw new ProbeFailure(
        "transport_error",
        "reachable",
        `MCP endpoint returned HTTP ${initialize.response.status}`
      );
    }
    const initializeMessage = parseJsonRpcResponse(initialize.response.bodyText, 1);
    const initializeResult = readInitializeResult(initializeMessage);
    assertCompatibleProtocol(initializeResult.protocolVersion);
    const sessionId = initialize.response.headers.get("mcp-session-id") ?? undefined;
    const negotiatedHeaders = {
      ...headers,
      "MCP-Protocol-Version": initializeResult.protocolVersion,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    };
    try {
      await this.fetchNotification(config.url, initializedNotification(), {
        ...config,
        headers: negotiatedHeaders,
        timeoutMs,
        maxResponseBytes,
      });

      let tools: JsonRpcResponse | undefined;
      if (hasToolsCapability(initializeResult.capabilities)) {
        const toolsResponse = await this.fetchJsonRpc(config.url, toolsListRequest(2), {
          ...config,
          headers: negotiatedHeaders,
          timeoutMs,
          maxResponseBytes,
        });
        if (!toolsResponse.response.ok) {
          throw new ProbeFailure(
            "capability_failed",
            "reachable",
            `MCP tools/list returned HTTP ${toolsResponse.response.status}`
          );
        }
        tools = parseJsonRpcResponse(toolsResponse.response.bodyText, 2);
        if (tools.error) {
          throw new ProbeFailure("capability_failed", "reachable", "MCP tools/list failed");
        }
      }

      return { initialize: initializeMessage, ...(tools ? { tools } : {}) };
    } catch (error: unknown) {
      throw markProbeReachable(error, "MCP HTTP session failed after initialize");
    }
  }

  private async fetchNotification(
    url: string,
    notification: Record<string, unknown>,
    options: MCPHttpHealthConfig & {
      headers: Record<string, string>;
      timeoutMs: number;
      maxResponseBytes: number;
    }
  ): Promise<void> {
    try {
      const response = await this.fetchText(url, {
        label: "Atlas MCP health policy",
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body: JSON.stringify(notification),
        timeoutMs: options.timeoutMs,
        maxResponseBytes: options.maxResponseBytes,
        maxRedirects: 0,
        ...(options.trustedPrivateHosts
          ? { trustedPrivateHosts: options.trustedPrivateHosts }
          : {}),
      });
      if (!response.ok) {
        throw new ProbeFailure(
          "initialize_failed",
          "reachable",
          `MCP initialized notification returned HTTP ${response.status}`
        );
      }
    } catch (error: unknown) {
      if (error instanceof ProbeFailure) throw error;
      if (error instanceof UrlPolicyError) {
        throw new ProbeFailure("policy_blocked", "unreachable", "MCP endpoint violates URL policy");
      }
      if (error instanceof SafeFetchError && /timed out/i.test(error.message)) {
        throw new ProbeFailure("timeout", "unreachable", "MCP HTTP probe timed out");
      }
      throw new ProbeFailure("transport_error", "unreachable", "MCP HTTP transport failed");
    }
  }

  private async fetchJsonRpc(
    url: string,
    request: Record<string, unknown>,
    options: MCPHttpHealthConfig & {
      headers: Record<string, string>;
      timeoutMs: number;
      maxResponseBytes: number;
    }
  ): Promise<{ response: SafeFetchResult }> {
    try {
      const response = await this.fetchText(url, {
        label: "Atlas MCP health policy",
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: HTTP_CONTENT_TYPES.join(", "),
          ...options.headers,
        },
        body: JSON.stringify(request),
        timeoutMs: options.timeoutMs,
        maxResponseBytes: options.maxResponseBytes,
        maxRedirects: 0,
        allowedContentTypes: HTTP_CONTENT_TYPES,
        ...(options.trustedPrivateHosts
          ? { trustedPrivateHosts: options.trustedPrivateHosts }
          : {}),
      });
      return { response };
    } catch (error: unknown) {
      if (error instanceof UrlPolicyError) {
        throw new ProbeFailure("policy_blocked", "unreachable", "MCP endpoint violates URL policy");
      }
      if (error instanceof SafeFetchError && /timed out/i.test(error.message)) {
        throw new ProbeFailure("timeout", "unreachable", "MCP HTTP probe timed out");
      }
      if (error instanceof ProbeFailure) throw error;
      throw new ProbeFailure("transport_error", "unreachable", "MCP HTTP transport failed");
    }
  }

  private async probeStdio(config: MCPStdioHealthConfig): Promise<ProbeHandshake> {
    validateStdioConfig(config, this.allowedStdioCommands);
    const timeoutMs = positiveInteger(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, "stdio timeout");
    const maxOutputBytes = positiveInteger(
      config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      "stdio output limit"
    );
    const environment = resolveEnvironment(config.envFrom);
    const child = this.spawnProcess(config.command, config.args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: environment,
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;
    const session = new JsonLineSession(child, maxOutputBytes);

    let initialized = false;
    try {
      const initializePromise = session.waitForResponse(1, timeoutMs);
      child.stdin.write(`${JSON.stringify(initializeRequest(1))}\n`);
      const initialize = await initializePromise;
      const initializeResult = readInitializeResult(initialize);
      assertCompatibleProtocol(initializeResult.protocolVersion);
      initialized = true;
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`
      );

      let tools: JsonRpcResponse | undefined;
      if (hasToolsCapability(initializeResult.capabilities)) {
        const toolsPromise = session.waitForResponse(2, timeoutMs);
        child.stdin.write(`${JSON.stringify(toolsListRequest(2))}\n`);
        tools = await toolsPromise;
        if (tools.error) {
          throw new ProbeFailure("capability_failed", "reachable", "MCP tools/list failed");
        }
      }
      return { initialize, ...(tools ? { tools } : {}) };
    } catch (error: unknown) {
      if (initialized) {
        throw markProbeReachable(error, "MCP stdio session failed after initialize");
      }
      if (error instanceof ProbeFailure) throw error;
      if (error instanceof SessionFailure) {
        throw new ProbeFailure(error.category, error.liveness, error.message);
      }
      throw new ProbeFailure("transport_error", "unreachable", "MCP stdio transport failed");
    } finally {
      session.close();
    }
  }
}

interface ProbeHandshake {
  initialize: JsonRpcResponse;
  tools?: JsonRpcResponse;
}

class ProbeFailure extends Error {
  constructor(
    readonly category: MCPHealthFailureCategory,
    readonly liveness: MCPHealthSnapshot["liveness"],
    message: string
  ) {
    super(message);
    this.name = "ProbeFailure";
  }
}

function markProbeReachable(error: unknown, fallbackMessage: string): ProbeFailure {
  if (error instanceof ProbeFailure) {
    return new ProbeFailure(error.category, "reachable", error.message);
  }
  if (error instanceof SessionFailure) {
    return new ProbeFailure(error.category, "reachable", error.message);
  }
  return new ProbeFailure("transport_error", "reachable", fallbackMessage);
}

class SessionFailure extends Error {
  constructor(
    readonly category: MCPHealthFailureCategory,
    readonly liveness: MCPHealthSnapshot["liveness"],
    message: string
  ) {
    super(message);
    this.name = "SessionFailure";
  }
}

class JsonLineSession {
  private buffer = "";
  private closedError: SessionFailure | undefined;
  private readonly messages: JsonRpcResponse[] = [];
  private outputBytes = 0;
  private exited = false;
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly maxOutputBytes: number
  ) {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    child.stderr.on("data", (chunk: string) => this.onAuxiliaryData(chunk));
    child.once("error", () =>
      this.fail("command_failed", "unreachable", "MCP command failed to start")
    );
    child.once("exit", (code, signal) => {
      this.exited = true;
      if (!this.closedError && code !== 0) {
        this.fail(
          "command_failed",
          this.outputBytes > 0 ? "reachable" : "unreachable",
          `MCP command exited before readiness (code ${code ?? "none"}, signal ${signal ?? "none"})`
        );
      }
    });
  }

  async waitForResponse(id: string | number, timeoutMs: number): Promise<JsonRpcResponse> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const index = this.messages.findIndex((message) => message.id === id);
      if (index !== -1) {
        const [message] = this.messages.splice(index, 1);
        if (message) return message;
      }
      if (this.closedError) throw this.closedError;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new SessionFailure("timeout", "unreachable", "MCP stdio probe timed out");
      }
      await new Promise<void>((resolve) => {
        const notify = (): void => {
          clearTimeout(timer);
          this.waiters.delete(notify);
          resolve();
        };
        const timer = setTimeout(notify, remaining);
        this.waiters.add(notify);
      });
    }
  }

  close(): void {
    this.child.stdin.end();
    if (!this.exited) {
      this.child.kill("SIGTERM");
      const killTimer = setTimeout(() => {
        if (!this.exited) this.child.kill("SIGKILL");
      }, 100);
      killTimer.unref();
    }
    this.notify();
  }

  private onAuxiliaryData(chunk: string): void {
    this.outputBytes += Buffer.byteLength(chunk, "utf8");
    if (this.outputBytes > this.maxOutputBytes) {
      this.fail("output_limit", "reachable", "MCP stdio output exceeded the configured limit");
      this.child.kill("SIGKILL");
    }
  }

  private onData(chunk: string): void {
    this.outputBytes += Buffer.byteLength(chunk, "utf8");
    if (this.outputBytes > this.maxOutputBytes) {
      this.fail("output_limit", "reachable", "MCP stdio output exceeded the configured limit");
      this.child.kill("SIGKILL");
      return;
    }
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        this.messages.push(validateJsonRpcResponse(JSON.parse(line) as unknown));
      } catch {
        this.fail("malformed_response", "reachable", "MCP stdio returned malformed JSON-RPC");
        this.child.kill("SIGKILL");
        return;
      }
    }
    this.notify();
  }

  private fail(
    category: MCPHealthFailureCategory,
    liveness: MCPHealthSnapshot["liveness"],
    message: string
  ): void {
    this.closedError ??= new SessionFailure(category, liveness, message);
    this.notify();
  }

  private notify(): void {
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }
}

function initializeRequest(id: number): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "atlas-health-monitor", version: "1.0.0" },
    },
  };
}

function initializedNotification(): Record<string, unknown> {
  return { jsonrpc: "2.0", method: "notifications/initialized" };
}

function toolsListRequest(id: number): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

function parseJsonRpcResponse(body: string, expectedId: number): JsonRpcResponse {
  const trimmed = body.trim();
  let value: unknown;
  try {
    const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith("data:"));
    value = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(trimmed);
  } catch {
    throw new ProbeFailure(
      "malformed_response",
      "reachable",
      "MCP endpoint returned malformed JSON-RPC"
    );
  }
  let response: JsonRpcResponse;
  try {
    response = validateJsonRpcResponse(value);
  } catch {
    throw new ProbeFailure(
      "malformed_response",
      "reachable",
      "MCP endpoint returned malformed JSON-RPC"
    );
  }
  if (response.id !== expectedId) {
    throw new ProbeFailure(
      "malformed_response",
      "reachable",
      "MCP response ID did not match the request"
    );
  }
  return response;
}

function validateJsonRpcResponse(value: unknown): JsonRpcResponse {
  if (!value || typeof value !== "object") throw new TypeError("invalid JSON-RPC response");
  const message = value as Record<string, unknown>;
  if (message["jsonrpc"] !== "2.0" || !("id" in message)) {
    throw new TypeError("invalid JSON-RPC response");
  }
  if (message["result"] !== undefined && typeof message["result"] !== "object") {
    throw new TypeError("invalid JSON-RPC result");
  }
  return message as unknown as JsonRpcResponse;
}

function readInitializeResult(response: JsonRpcResponse): InitializeResult {
  if (response.error || !response.result) {
    throw new ProbeFailure(
      "initialize_failed",
      "reachable",
      "MCP initialize response was unsuccessful"
    );
  }
  const protocolVersion = response.result["protocolVersion"];
  const capabilities = response.result["capabilities"];
  if (
    typeof protocolVersion !== "string" ||
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  ) {
    throw new ProbeFailure(
      "malformed_response",
      "reachable",
      "MCP initialize response was incomplete"
    );
  }
  return { protocolVersion, capabilities: capabilities as Record<string, unknown> };
}

function assertCompatibleProtocol(protocolVersion: string): void {
  if (!isSupportedProtocolVersion(protocolVersion)) {
    throw new ProbeFailure(
      "incompatible_protocol",
      "reachable",
      "MCP server negotiated an unsupported protocol version"
    );
  }
}

function hasToolsCapability(capabilities: Record<string, unknown>): boolean {
  return capabilities["tools"] !== undefined;
}

function readToolCount(response: JsonRpcResponse): number {
  const tools = response.result?.["tools"];
  if (!Array.isArray(tools)) {
    throw new ProbeFailure(
      "capability_failed",
      "reachable",
      "MCP tools/list response was malformed"
    );
  }
  return tools.length;
}

function resolveHeadersFromEnvironment(
  mapping: Record<string, string> | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [header, environmentName] of Object.entries(mapping ?? {})) {
    if (
      !/^[A-Za-z0-9-]{1,100}$/.test(header) ||
      RESERVED_MCP_HEADERS.has(header.toLowerCase()) ||
      !ENVIRONMENT_NAME_PATTERN.test(environmentName)
    ) {
      throw new ProbeFailure("unconfigured", "unknown", "MCP HTTP secret mapping is invalid");
    }
    const value = process.env[environmentName];
    if (!value) {
      throw new ProbeFailure(
        "unconfigured",
        "unknown",
        "MCP HTTP credential environment is missing"
      );
    }
    headers[header] = value;
  }
  return headers;
}

function resolveEnvironment(mapping: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [targetName, sourceName] of Object.entries(mapping ?? {})) {
    if (!ENVIRONMENT_NAME_PATTERN.test(targetName) || !ENVIRONMENT_NAME_PATTERN.test(sourceName)) {
      throw new ProbeFailure("unconfigured", "unknown", "MCP stdio environment mapping is invalid");
    }
    const value = process.env[sourceName];
    if (value === undefined) {
      throw new ProbeFailure(
        "unconfigured",
        "unknown",
        "MCP stdio credential environment is missing"
      );
    }
    environment[targetName] = value;
  }
  return environment;
}

function validateStdioConfig(config: MCPStdioHealthConfig, allowedCommands: Set<string>): void {
  if (!path.isAbsolute(config.command) || !allowedCommands.has(config.command)) {
    throw new ProbeFailure(
      "command_not_allowed",
      "unknown",
      "MCP stdio command is not explicitly allowed"
    );
  }
  if (
    !Array.isArray(config.args) ||
    config.args.length > 100 ||
    config.args.some(
      (argument) =>
        typeof argument !== "string" || argument.length > 4_096 || argument.includes("\0")
    )
  ) {
    throw new ProbeFailure("unconfigured", "unknown", "MCP stdio arguments are invalid");
  }
}

function normalizeProbeFailure(error: unknown): ProbeFailure {
  if (error instanceof ProbeFailure) return error;
  return new ProbeFailure("transport_error", "unreachable", "MCP probe failed");
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive integer`);
  return value;
}
