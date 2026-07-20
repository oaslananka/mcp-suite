import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { logger } from "@oaslananka/shared";
import type { ForgeAuthPolicy, ForgePrincipal } from "./AuthPolicy.js";

export interface ForgeWebSocketOptions {
  allowedCategories: string[];
  allowedOrigins: string[];
  allowMissingOrigin: boolean;
  idleTimeoutMs: number;
  maxConnections: number;
  maxConnectionsPerPrincipal: number;
  maxPayloadBytes: number;
  maxQueueBytes: number;
  maxSubscriptions: number;
  messageRateLimit: { max: number; windowMs: number };
  path: string;
  pingIntervalMs: number;
}

export type ForgeWebSocketOptionsInput = Omit<
  Partial<ForgeWebSocketOptions>,
  "messageRateLimit"
> & {
  messageRateLimit?: Partial<ForgeWebSocketOptions["messageRateLimit"]>;
};

interface ConnectionState {
  isAlive: boolean;
  lastActivityAt: number;
  principal: ForgePrincipal;
  subscriptions: Set<string>;
}

interface ClientMessage {
  categories?: unknown;
  type?: unknown;
}

const DEFAULT_OPTIONS: Omit<ForgeWebSocketOptions, "allowedOrigins"> = {
  allowedCategories: ["runs", "pipelines", "system"],
  allowMissingOrigin: false,
  idleTimeoutMs: 60_000,
  maxConnections: 100,
  maxConnectionsPerPrincipal: 5,
  maxPayloadBytes: 16_384,
  maxQueueBytes: 262_144,
  maxSubscriptions: 8,
  messageRateLimit: { max: 30, windowMs: 10_000 },
  path: "/ws",
  pingIntervalMs: 30_000,
};

export class ForgeWebSocketHub {
  private readonly connections = new Map<WebSocket, ConnectionState>();
  private readonly messageLog = new Map<string, number[]>();
  private readonly options: ForgeWebSocketOptions;
  private readonly wss: WebSocketServer;
  private readonly livenessTimer: NodeJS.Timeout;
  private readonly upgradeHandler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

  constructor(
    private readonly server: Server,
    private readonly auth: ForgeAuthPolicy,
    options: ForgeWebSocketOptionsInput & { allowedOrigins: string[] }
  ) {
    this.options = resolveOptions(options);
    this.wss = new WebSocketServer({
      clientTracking: false,
      maxPayload: this.options.maxPayloadBytes,
      noServer: true,
      perMessageDeflate: false,
    });
    this.upgradeHandler = (request, socket, head) => this.handleUpgrade(request, socket, head);
    this.server.on("upgrade", this.upgradeHandler);
    this.livenessTimer = setInterval(() => this.checkLiveness(), this.options.pingIntervalMs);
    this.livenessTimer.unref();
  }

  broadcastEvent(category: string, payload: unknown): number {
    if (!this.options.allowedCategories.includes(category)) {
      return 0;
    }

    const message = {
      type: "event",
      category,
      payload: redactSensitiveFields(payload),
    };
    let delivered = 0;
    for (const [socket, state] of this.connections) {
      if (
        state.subscriptions.has(category) &&
        this.canReadCategory(state.principal, category) &&
        this.sendJson(socket, message)
      ) {
        delivered += 1;
      }
    }
    return delivered;
  }

  async close(): Promise<void> {
    clearInterval(this.livenessTimer);
    this.server.off("upgrade", this.upgradeHandler);
    for (const socket of this.connections.keys()) {
      socket.terminate();
    }
    this.connections.clear();
    this.messageLog.clear();

    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.pruneMessageLog(Date.now() - this.options.messageRateLimit.windowMs);
    const path = readPath(request.url);
    if (path !== this.options.path) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const origin = request.headers.origin;
    if (!origin && !this.options.allowMissingOrigin) {
      rejectUpgrade(socket, 403, "Origin Required");
      return;
    }
    if (origin && !this.options.allowedOrigins.includes(origin)) {
      rejectUpgrade(socket, 403, "Origin Not Allowed");
      return;
    }

    if (!this.auth.isConfigured()) {
      rejectUpgrade(socket, 503, "Authentication Not Configured");
      return;
    }

    const principal = this.auth.resolveBearer(request.headers.authorization);
    if (!principal) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (!this.canOpenEventChannel(principal)) {
      rejectUpgrade(socket, 403, "Insufficient Scope");
      return;
    }

    if (this.connections.size >= this.options.maxConnections) {
      rejectUpgrade(socket, 429, "Connection Limit Exceeded");
      return;
    }
    if (this.connectionCountFor(principal.id) >= this.options.maxConnectionsPerPrincipal) {
      rejectUpgrade(socket, 429, "Principal Connection Limit Exceeded");
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (webSocket) => {
      this.handleConnection(webSocket, principal);
    });
  }

  private handleConnection(socket: WebSocket, principal: ForgePrincipal): void {
    const state: ConnectionState = {
      isAlive: true,
      lastActivityAt: Date.now(),
      principal,
      subscriptions: new Set<string>(),
    };
    this.connections.set(socket, state);

    socket.on("pong", () => {
      state.isAlive = true;
    });
    socket.on("message", (data) => this.handleMessage(socket, state, data));
    socket.on("close", () => this.removeConnection(socket));
    socket.on("error", () => this.removeConnection(socket));

    this.sendJson(socket, {
      type: "connected",
      principalId: principal.id,
      availableCategories: this.options.allowedCategories.filter((category) =>
        this.canReadCategory(principal, category)
      ),
    });
    logger.info({ principalId: principal.id }, "Authenticated WebSocket client connected");
  }

  private handleMessage(socket: WebSocket, state: ConnectionState, data: RawData): void {
    state.lastActivityAt = Date.now();
    state.isAlive = true;
    if (!this.consumeMessageBudget(state.principal.id)) {
      socket.close(1008, "Message rate limit exceeded");
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      socket.close(1008, "Invalid JSON message");
      return;
    }

    if (message.type === "ping") {
      this.sendJson(socket, { type: "pong" });
      return;
    }

    if (message.type === "subscribe") {
      this.updateSubscriptions(socket, state, message.categories, true);
      return;
    }

    if (message.type === "unsubscribe") {
      this.updateSubscriptions(socket, state, message.categories, false);
      return;
    }

    socket.close(1008, "Unsupported message type");
  }

  private updateSubscriptions(
    socket: WebSocket,
    state: ConnectionState,
    categoriesValue: unknown,
    subscribe: boolean
  ): void {
    if (
      !Array.isArray(categoriesValue) ||
      categoriesValue.some((category) => typeof category !== "string")
    ) {
      socket.close(1008, "Categories must be a string array");
      return;
    }

    const requested = [...new Set(categoriesValue as string[])];
    const denied: string[] = [];
    for (const category of requested) {
      if (!this.options.allowedCategories.includes(category)) {
        denied.push(category);
        continue;
      }

      if (subscribe) {
        if (!this.canReadCategory(state.principal, category)) {
          denied.push(category);
          continue;
        }
        if (
          !state.subscriptions.has(category) &&
          state.subscriptions.size >= this.options.maxSubscriptions
        ) {
          denied.push(category);
          continue;
        }
        state.subscriptions.add(category);
      } else {
        state.subscriptions.delete(category);
      }
    }

    this.sendJson(socket, {
      type: subscribe ? "subscribed" : "unsubscribed",
      categories: [...state.subscriptions],
      denied,
    });
  }

  private consumeMessageBudget(principalId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.options.messageRateLimit.windowMs;
    this.pruneMessageLog(windowStart);
    const recent = (this.messageLog.get(principalId) ?? []).filter(
      (timestamp) => timestamp >= windowStart
    );
    if (recent.length >= this.options.messageRateLimit.max) {
      this.messageLog.set(principalId, recent);
      return false;
    }
    recent.push(now);
    this.messageLog.set(principalId, recent);
    return true;
  }

  private pruneMessageLog(windowStart: number): void {
    for (const [principalId, timestamps] of this.messageLog) {
      const recent = timestamps.filter((timestamp) => timestamp >= windowStart);
      if (recent.length === 0) {
        this.messageLog.delete(principalId);
      } else if (recent.length !== timestamps.length) {
        this.messageLog.set(principalId, recent);
      }
    }
  }

  private checkLiveness(): void {
    const now = Date.now();
    for (const [socket, state] of this.connections) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (now - state.lastActivityAt > this.options.idleTimeoutMs) {
        socket.close(1001, "Idle timeout");
        continue;
      }
      if (!state.isAlive) {
        socket.terminate();
        continue;
      }
      state.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }

  private sendJson(socket: WebSocket, value: unknown): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const serialized = JSON.stringify(value);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes + socket.bufferedAmount > this.options.maxQueueBytes) {
      socket.close(1013, "Outbound queue limit exceeded");
      return false;
    }

    socket.send(serialized, (error) => {
      if (error) {
        socket.terminate();
      }
    });
    return true;
  }

  private removeConnection(socket: WebSocket): void {
    this.connections.delete(socket);
  }

  private connectionCountFor(principalId: string): number {
    let count = 0;
    for (const state of this.connections.values()) {
      if (state.principal.id === principalId) {
        count += 1;
      }
    }
    return count;
  }

  private canOpenEventChannel(principal: ForgePrincipal): boolean {
    return this.auth.hasAnyScope(principal, [
      "events:subscribe",
      "events:read",
      ...this.options.allowedCategories.map((category) => `events:${category}`),
    ]);
  }

  private canReadCategory(principal: ForgePrincipal, category: string): boolean {
    return this.auth.hasAnyScope(principal, ["events:read", `events:${category}`]);
  }
}

function resolveOptions(
  options: ForgeWebSocketOptionsInput & { allowedOrigins: string[] }
): ForgeWebSocketOptions {
  const messageRateLimit = {
    ...DEFAULT_OPTIONS.messageRateLimit,
    ...options.messageRateLimit,
  };
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    allowedCategories: [...new Set(options.allowedCategories ?? DEFAULT_OPTIONS.allowedCategories)],
    allowedOrigins: [...new Set(options.allowedOrigins)],
    idleTimeoutMs: positiveInteger(
      options.idleTimeoutMs ?? DEFAULT_OPTIONS.idleTimeoutMs,
      "idleTimeoutMs"
    ),
    maxConnections: positiveInteger(
      options.maxConnections ?? DEFAULT_OPTIONS.maxConnections,
      "maxConnections"
    ),
    maxConnectionsPerPrincipal: positiveInteger(
      options.maxConnectionsPerPrincipal ?? DEFAULT_OPTIONS.maxConnectionsPerPrincipal,
      "maxConnectionsPerPrincipal"
    ),
    maxPayloadBytes: positiveInteger(
      options.maxPayloadBytes ?? DEFAULT_OPTIONS.maxPayloadBytes,
      "maxPayloadBytes"
    ),
    maxQueueBytes: positiveInteger(
      options.maxQueueBytes ?? DEFAULT_OPTIONS.maxQueueBytes,
      "maxQueueBytes"
    ),
    maxSubscriptions: positiveInteger(
      options.maxSubscriptions ?? DEFAULT_OPTIONS.maxSubscriptions,
      "maxSubscriptions"
    ),
    messageRateLimit: {
      max: positiveInteger(messageRateLimit.max, "messageRateLimit.max"),
      windowMs: positiveInteger(messageRateLimit.windowMs, "messageRateLimit.windowMs"),
    },
    path: normalizePath(options.path ?? DEFAULT_OPTIONS.path),
    pingIntervalMs: positiveInteger(
      options.pingIntervalMs ?? DEFAULT_OPTIONS.pingIntervalMs,
      "pingIntervalMs"
    ),
  };
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Forge WebSocket ${label} must be a positive integer`);
  }
  return value;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error("Forge WebSocket path must be an absolute path without query or fragment");
  }
  return trimmed;
}

function readPath(value: string | undefined): string {
  try {
    return new URL(value ?? "/", "http://localhost").pathname;
  } catch {
    return "";
  }
}

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  if (socket.writable) {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  socket.destroy();
}

function redactSensitiveFields(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 12) {
    return "[TRUNCATED]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => redactSensitiveFields(entry, seen, depth + 1));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key)
      ? "[REDACTED]"
      : redactSensitiveFields(entry, seen, depth + 1);
  }
  return redacted;
}

function isSensitiveKey(key: string): boolean {
  return /authorization|cookie|token|secret|password|api[-_]?key/i.test(key);
}
