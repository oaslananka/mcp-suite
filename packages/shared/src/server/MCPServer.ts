import type { Transport } from "../transport/transport.js";
import { 
    JSONRPCResponse, 
    JSONRPCNotification, 
    JSONRPCMessage, 
    isJSONRPCRequest, 
    isJSONRPCNotification 
} from "../protocol/jsonrpc.js";
import { Methods } from "../protocol/methods.js";
import { 
    ServerCapabilities, 
    InitializeResult 
} from "../protocol/capabilities.js";
import { MCPError, ErrorCodes } from "../protocol/errors.js";
import { MCPRouter } from "./router.js";
import { logger } from "../utils/logger.js";
import { negotiateProtocolVersion } from "../protocol/version.js";

export interface MCPServerOptions {
    serverInfo: { name: string; version: string };
    capabilities?: ServerCapabilities;
}

export class MCPServer {
    private readonly transport: Transport;
    private readonly options: MCPServerOptions;
    private readonly router: MCPRouter;
    private isInitialized = false;
    private hasStarted = false;
    private isStopping = false;

    constructor(transport: Transport, options: MCPServerOptions) {
        this.transport = transport;
        this.options = options;
        this.router = new MCPRouter();

        this.transport.on("message", this.handleMessage.bind(this));
        
        // Register default methods
        this.router.on(Methods.Initialize, this.handleInitialize.bind(this));
        this.router.on(Methods.Ping, async () => ({}));
        this.router.onNotification(Methods.Initialized, async () => {
            this.isInitialized = true;
            logger.info("MCP Server Initialized");
        });
        this.transport.on("close", () => {
            if (!this.isStopping) {
                void this.stop();
            }
        });
    }

    public async start(): Promise<void> {
        if (this.hasStarted) {
            return;
        }

        this.hasStarted = true;
        this.registerSignalHandlers();
        logger.info("Starting MCP Server...");
        await this.transport.start();
    }

    public async stop(): Promise<void> {
        if (this.isStopping) {
            return;
        }

        this.isStopping = true;
        logger.info("Stopping MCP Server...");
        await this.transport.close();
        process.off("SIGTERM", this.handleSigterm);
        process.off("SIGINT", this.handleSigint);
        this.hasStarted = false;
        this.isInitialized = false;
        this.isStopping = false;
    }

    public getRouter(): MCPRouter {
        return this.router;
    }

    private async handleInitialize(params: unknown): Promise<InitializeResult> {
        const requestedVersion = typeof params === "object" && params !== null && "protocolVersion" in params
            ? String((params as { protocolVersion: string }).protocolVersion)
            : "";

        return {
            protocolVersion: negotiateProtocolVersion(requestedVersion),
            capabilities: this.options.capabilities || {},
            serverInfo: this.options.serverInfo
        };
    }

    private async handleMessage(message: JSONRPCMessage) {
        if (isJSONRPCRequest(message)) {
            try {
                if (message.method !== Methods.Initialize && !this.isInitialized) {
                    throw new MCPError(ErrorCodes.InvalidRequest, "Server not initialized");
                }
                const result = await this.router.handleRequest(message.method, message.params);
                await this.sendResponse(message.id, result);
            } catch (err: unknown) {
                const code = err instanceof MCPError ? err.code : ErrorCodes.InternalError;
                const msg = err instanceof Error ? err.message : "Unknown error";
                const data = err instanceof MCPError ? err.data : undefined;
                logger.error({ err }, "Error handling request");
                await this.sendError(message.id, code, msg, data);
            }
        } else if (isJSONRPCNotification(message)) {
            try {
                if (message.method !== Methods.Initialized && !this.isInitialized) {
                    return; // Ignore notifications before init
                }
                await this.router.handleNotification(message.method, message.params);
            } catch (err: unknown) {
                logger.error({ err }, "Failed to handle notification");
            }
        }
    }

    private async sendResponse(id: string | number, result: unknown): Promise<void> {
        const response: JSONRPCResponse = {
            jsonrpc: "2.0",
            id,
            result
        };
        await this.transport.send(response);
    }

    private async sendError(id: string | number, code: number, message: string, data?: unknown): Promise<void> {
        const response: JSONRPCResponse = {
            jsonrpc: "2.0",
            id,
            error: {
                code,
                message,
                data
            }
        };
        await this.transport.send(response);
    }

    public async sendNotification(method: string, params?: unknown): Promise<void> {
        const notification: JSONRPCNotification = {
            jsonrpc: "2.0",
            method,
            params
        };
        await this.transport.send(notification);
    }

    private registerSignalHandlers(): void {
        process.once("SIGINT", this.handleSigint);
        process.once("SIGTERM", this.handleSigterm);
    }

    private readonly handleSigint = (): void => {
        void this.shutdownFromSignal("SIGINT");
    };

    private readonly handleSigterm = (): void => {
        void this.shutdownFromSignal("SIGTERM");
    };

    private async shutdownFromSignal(signal: string): Promise<void> {
        logger.info({ signal }, "Received shutdown signal");
        await this.stop();
        process.exit(0);
    }
}
