import { EventEmitter } from "node:events";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { JSONRPCMessage as SDKJSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "../protocol/jsonrpc.js";
import { LATEST_PROTOCOL_VERSION } from "../protocol/version.js";
import type { Transport } from "./transport.js";

export type HTTPCompatibilityMode = "streamable-http" | "legacy-http-sse";

export interface HTTPTransportOptions {
  url: string;
  headers?: Record<string, string>;
  compatibilityMode?: HTTPCompatibilityMode;
  legacySseUrl?: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  reconnectBackoffFactor?: number;
  fetch?: typeof globalThis.fetch;
  terminateSessionOnClose?: boolean;
}

type SDKTransport = StreamableHTTPClientTransport | SSEClientTransport;

/** MCP 2025-11-25 Streamable HTTP transport backed by the official SDK. */
export class StreamableHTTPTransport extends EventEmitter implements Transport {
  private readonly options: HTTPTransportOptions;
  private protocolVersion = LATEST_PROTOCOL_VERSION;
  private reconnectPolicy: {
    enabled: boolean;
    maxAttempts: number;
    delayMs: number;
    backoffFactor: number;
  };
  private delegate: SDKTransport | undefined;
  private started = false;
  private closed = false;

  constructor(options: HTTPTransportOptions) {
    super();
    this.options = options;
    this.reconnectPolicy = {
      enabled: options.reconnect ?? true,
      maxAttempts: options.maxReconnectAttempts ?? 5,
      delayMs: options.reconnectDelayMs ?? 1_000,
      backoffFactor: options.reconnectBackoffFactor ?? 2,
    };
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
    this.delegate?.setProtocolVersion(version);
  }

  setReconnectPolicy(policy: {
    enabled: boolean;
    maxAttempts: number;
    delayMs: number;
    backoffFactor: number;
  }): void {
    if (this.started) throw new Error("Reconnect policy cannot change after transport start");
    this.reconnectPolicy = policy;
  }

  get sessionId(): string | undefined {
    return this.delegate instanceof StreamableHTTPClientTransport
      ? this.delegate.sessionId
      : undefined;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.closed = false;
    this.delegate = this.createDelegate();
    this.bindDelegate(this.delegate);
    this.delegate.setProtocolVersion(this.protocolVersion);
    await this.delegate.start();
    this.started = true;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.requireDelegate().send(message as SDKJSONRPCMessage);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const delegate = this.delegate;
    this.delegate = undefined;
    this.started = false;
    if (!delegate) {
      this.emit("close");
      return;
    }
    try {
      if (
        delegate instanceof StreamableHTTPClientTransport &&
        (this.options.terminateSessionOnClose ?? true) &&
        delegate.sessionId
      ) {
        await delegate.terminateSession();
      }
    } finally {
      await delegate.close();
    }
  }

  async resumeStream(lastEventId: string): Promise<void> {
    await this.requireModernDelegate().resumeStream(lastEventId);
  }

  async terminateSession(): Promise<void> {
    await this.requireModernDelegate().terminateSession();
  }

  private createDelegate(): SDKTransport {
    const url = new URL(this.options.url);
    const requestInit: RequestInit = this.options.headers ? { headers: this.options.headers } : {};
    const fetchImpl = this.options.fetch;
    if (this.options.compatibilityMode === "legacy-http-sse") {
      const legacyUrl = new URL(this.options.legacySseUrl ?? "./sse", withTrailingSlash(url));
      return new SSEClientTransport(legacyUrl, {
        requestInit,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
      });
    }
    const opts: StreamableHTTPClientTransportOptions = {
      requestInit,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      reconnectionOptions: {
        maxReconnectionDelay: 30_000,
        initialReconnectionDelay: this.reconnectPolicy.delayMs,
        reconnectionDelayGrowFactor: this.reconnectPolicy.backoffFactor,
        maxRetries: this.reconnectPolicy.enabled ? this.reconnectPolicy.maxAttempts : 0,
      },
    };
    return new StreamableHTTPClientTransport(url, opts);
  }

  private bindDelegate(delegate: SDKTransport): void {
    delegate.onmessage = (message) => this.emit("message", message as JSONRPCMessage);
    delegate.onerror = (error) => this.emit("error", error);
    delegate.onclose = () => this.emit("close");
  }

  private requireDelegate(): SDKTransport {
    if (!this.delegate) throw new Error("HTTP transport has not been started");
    return this.delegate;
  }

  private requireModernDelegate(): StreamableHTTPClientTransport {
    const delegate = this.requireDelegate();
    if (!(delegate instanceof StreamableHTTPClientTransport)) {
      throw new TypeError("Session operations are unavailable in legacy HTTP+SSE mode");
    }
    return delegate;
  }
}

function withTrailingSlash(url: URL): URL {
  const result = new URL(url);
  if (!result.pathname.endsWith("/")) result.pathname += "/";
  return result;
}
