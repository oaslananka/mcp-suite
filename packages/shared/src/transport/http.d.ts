import { EventEmitter } from "node:events";
import type { JSONRPCMessage } from "../protocol/jsonrpc.js";
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
/** MCP 2025-11-25 Streamable HTTP transport backed by the official SDK. */
export declare class StreamableHTTPTransport extends EventEmitter implements Transport {
    private readonly options;
    private protocolVersion;
    private reconnectPolicy;
    private delegate;
    private started;
    private closed;
    constructor(options: HTTPTransportOptions);
    setProtocolVersion(version: string): void;
    setReconnectPolicy(policy: {
        enabled: boolean;
        maxAttempts: number;
        delayMs: number;
        backoffFactor: number;
    }): void;
    get sessionId(): string | undefined;
    start(): Promise<void>;
    send(message: JSONRPCMessage): Promise<void>;
    close(): Promise<void>;
    resumeStream(lastEventId: string): Promise<void>;
    terminateSession(): Promise<void>;
    private createDelegate;
    private bindDelegate;
    private requireDelegate;
    private requireModernDelegate;
}
//# sourceMappingURL=http.d.ts.map