import type { Transport } from "../transport/transport.js";
import { 
    JSONRPCRequest,
    JSONRPCNotification, 
    JSONRPCMessage, 
    isJSONRPCResponse, 
    isJSONRPCNotification 
} from "../protocol/jsonrpc.js";
import { Methods } from "../protocol/methods.js";
import { 
    ClientCapabilities, 
    ServerCapabilities, 
    InitializeRequestParams, 
    InitializeResult,
    SamplingCreateMessageParams,
    SamplingResult
} from "../protocol/capabilities.js";
import { MCPError } from "../protocol/errors.js";
import { v4 as uuidv4 } from "uuid";
import type { Tool, Resource, Prompt, ToolCallResult, PromptMessage, Task } from "../protocol/types.js";
import { EventEmitter } from "events";
import { StreamableHTTPTransport } from "../transport/http.js";
import {
    isSupportedProtocolVersion,
    LATEST_PROTOCOL_VERSION,
    type SupportedProtocolVersion,
} from "../protocol/version.js";

export interface MCPClientOptions {
    clientInfo: { name: string; version: string };
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

export class MCPClient extends EventEmitter {
    private readonly transport: Transport;
    private readonly options: MCPClientOptions;
    
    private pendingRequests: Map<string | number, { resolve: (res: unknown) => void; reject: (err: unknown) => void; timeout?: NodeJS.Timeout }> = new Map();
    public serverCapabilities?: ServerCapabilities;
    public serverInfo?: { name: string; version: string };
    private isConnected = false;
    private activeProtocolVersion: SupportedProtocolVersion = LATEST_PROTOCOL_VERSION;
    private readonly connectTimeoutMs: number;
    private readonly requestTimeoutMs: number;
    private manualDisconnect = false;

    constructor(transport: Transport, options: MCPClientOptions) {
        super();
        this.transport = transport;
        this.options = options;
        this.connectTimeoutMs = options.connectTimeoutMs ?? 30_000;
        this.requestTimeoutMs = options.requestTimeoutMs ?? this.connectTimeoutMs;

        if (this.transport instanceof StreamableHTTPTransport) {
            this.transport.setReconnectPolicy({
                enabled: options.reconnect?.enabled ?? true,
                maxAttempts: options.reconnect?.maxAttempts ?? 5,
                delayMs: options.reconnect?.delayMs ?? 1_000,
                backoffFactor: options.reconnect?.backoffFactor ?? 2,
            });
        }

        this.transport.on("message", this.handleMessage.bind(this));
        this.transport.on("close", () => {
            this.isConnected = false;
            if (!this.manualDisconnect) {
                this.emit("disconnected");
            }
            for (const [, req] of this.pendingRequests) {
                if (req.timeout) {
                    clearTimeout(req.timeout);
                }
                req.reject(new Error("Transport closed"));
            }
            this.pendingRequests.clear();
        });
    }

    public async connect(): Promise<InitializeResult> {
        this.manualDisconnect = false;
        await this.withTimeout(this.transport.start(), this.connectTimeoutMs, "Timed out while opening transport");
        this.isConnected = true;

        const params: InitializeRequestParams = {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            clientInfo: this.options.clientInfo,
            capabilities: this.options.capabilities || {}
        };

        const result = await this.withTimeout(
            this.request<InitializeResult>(Methods.Initialize, params),
            this.connectTimeoutMs,
            "Timed out during MCP initialize handshake",
        );

        if (!isSupportedProtocolVersion(result.protocolVersion)) {
            await this.disconnect();
            throw new Error(`Unsupported MCP protocol version: ${result.protocolVersion}`);
        }
        
        this.activeProtocolVersion = result.protocolVersion;
        this.serverCapabilities = result.capabilities;
        this.serverInfo = result.serverInfo;
        if (this.transport instanceof StreamableHTTPTransport) {
            this.transport.setProtocolVersion(result.protocolVersion);
        }

        await this.notify(Methods.Initialized, {});

        return result;
    }

    public async disconnect(): Promise<void> {
        this.manualDisconnect = true;
        await this.transport.close();
        this.isConnected = false;
    }

    public async request<T = unknown>(method: string, params?: unknown): Promise<T> {
        if (!this.isConnected && method !== Methods.Initialize) {
            throw new Error("Client not connected");
        }

        const id = uuidv4();
        const req: JSONRPCRequest = {
            jsonrpc: "2.0",
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timed out for method "${method}" after ${this.requestTimeoutMs}ms`));
            }, this.requestTimeoutMs);

            this.pendingRequests.set(id, {
                resolve: (res: unknown) => resolve(res as T),
                reject,
                timeout,
            });
            this.transport.send(req).catch((err: unknown) => {
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                reject(err);
            });
        });
    }

    public async notify(method: string, params?: unknown): Promise<void> {
        if (!this.isConnected) {
            throw new Error("Client not connected");
        }

        const notification: JSONRPCNotification = {
            jsonrpc: "2.0",
            method,
            params
        };
        return this.transport.send(notification);
    }

    private handleMessage(message: JSONRPCMessage) {
        if (isJSONRPCResponse(message)) {
            const req = this.pendingRequests.get(message.id);
            if (req) {
                this.pendingRequests.delete(message.id);
                if (req.timeout) {
                    clearTimeout(req.timeout);
                }
                if (message.error) {
                    req.reject(new MCPError(message.error.code, message.error.message, message.error.data));
                } else {
                    req.resolve(message.result);
                }
            }
        } else if (isJSONRPCNotification(message)) {
            this.emit(message.method, message.params);
        }
    }

    public onNotification(method: string, handler: (params: unknown) => void): void {
        this.on(method, handler);
    }

    public async ping(): Promise<void> {
        await this.request(Methods.Ping);
    }

    public async listTools(): Promise<{ tools: Tool[] }> {
        return this.request(Methods.ToolsList);
    }

    public async callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult> {
        return this.request(Methods.ToolsCall, { name, arguments: args });
    }

    public async listResources(): Promise<{ resources: Resource[] }> {
        return this.request(Methods.ResourcesList);
    }
    
    public async readResource(uri: string): Promise<{ contents: unknown[] }> {
        return this.request(Methods.ResourcesRead, { uri });
    }

    public async subscribeResource(uri: string): Promise<void> {
        await this.request(Methods.ResourcesSubscribe, { uri });
    }

    public async listPrompts(): Promise<{ prompts: Prompt[] }> {
        return this.request(Methods.PromptsList);
    }

    public async getPrompt(name: string, args?: Record<string, string>): Promise<{ messages: PromptMessage[] }> {
        return this.request(Methods.PromptsGet, { name, arguments: args });
    }

    public async createMessage(params: SamplingCreateMessageParams): Promise<SamplingResult> {
        return this.request(Methods.SamplingCreateMessage, params);
    }

    public async getTask(taskId: string): Promise<Task> {
        return this.request(Methods.TasksGet, { id: taskId });
    }

    public getProtocolVersion(): SupportedProtocolVersion {
        return this.activeProtocolVersion;
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
        let timer: NodeJS.Timeout | undefined;

        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
                }),
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
}
