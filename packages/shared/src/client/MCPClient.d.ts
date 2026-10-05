import type { Transport } from "../transport/transport.js";
import { ClientCapabilities, ServerCapabilities, InitializeResult, SamplingCreateMessageParams, SamplingResult } from "../protocol/capabilities.js";
import type { Tool, Resource, Prompt, ToolCallResult, PromptMessage, Task } from "../protocol/types.js";
import { EventEmitter } from "events";
import { type SupportedProtocolVersion } from "../protocol/version.js";
export interface MCPClientOptions {
    clientInfo: {
        name: string;
        version: string;
    };
    capabilities?: ClientCapabilities;
    connectTimeoutMs?: number;
    requestTimeoutMs?: number;
    reconnect?: {
        enabled?: boolean;
        maxAttempts?: number;
        delayMs?: number;
        backoffFactor?: number;
    };
}
export declare class MCPClient extends EventEmitter {
    private readonly transport;
    private readonly options;
    private pendingRequests;
    serverCapabilities?: ServerCapabilities;
    serverInfo?: {
        name: string;
        version: string;
    };
    private isConnected;
    private activeProtocolVersion;
    private readonly connectTimeoutMs;
    private readonly requestTimeoutMs;
    private manualDisconnect;
    constructor(transport: Transport, options: MCPClientOptions);
    connect(): Promise<InitializeResult>;
    disconnect(): Promise<void>;
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
    notify(method: string, params?: unknown): Promise<void>;
    private handleMessage;
    onNotification(method: string, handler: (params: unknown) => void): void;
    ping(): Promise<void>;
    listTools(): Promise<{
        tools: Tool[];
    }>;
    callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult>;
    listResources(): Promise<{
        resources: Resource[];
    }>;
    readResource(uri: string): Promise<{
        contents: unknown[];
    }>;
    subscribeResource(uri: string): Promise<void>;
    listPrompts(): Promise<{
        prompts: Prompt[];
    }>;
    getPrompt(name: string, args?: Record<string, string>): Promise<{
        messages: PromptMessage[];
    }>;
    createMessage(params: SamplingCreateMessageParams): Promise<SamplingResult>;
    getTask(taskId: string): Promise<Task>;
    getProtocolVersion(): SupportedProtocolVersion;
    private withTimeout;
}
//# sourceMappingURL=MCPClient.d.ts.map