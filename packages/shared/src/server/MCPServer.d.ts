import type { Transport } from "../transport/transport.js";
import { ServerCapabilities } from "../protocol/capabilities.js";
import { MCPRouter } from "./router.js";
export interface MCPServerOptions {
    serverInfo: {
        name: string;
        version: string;
    };
    capabilities?: ServerCapabilities;
}
export declare class MCPServer {
    private readonly transport;
    private readonly options;
    private readonly router;
    private isInitialized;
    private hasStarted;
    private isStopping;
    constructor(transport: Transport, options: MCPServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getRouter(): MCPRouter;
    private handleInitialize;
    private handleMessage;
    private sendResponse;
    private sendError;
    sendNotification(method: string, params?: unknown): Promise<void>;
    private registerSignalHandlers;
    private readonly handleSigint;
    private readonly handleSigterm;
    private shutdownFromSignal;
}
//# sourceMappingURL=MCPServer.d.ts.map