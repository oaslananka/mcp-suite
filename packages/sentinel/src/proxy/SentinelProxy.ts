import { ChildProcess, spawn } from "node:child_process";
import { MCPClient, MCPServer, ToolCallResult, Transport, StreamableHTTPTransport, StdioTransport, logger } from "@oaslananka/shared";
import { ApprovalGate } from "../approval/ApprovalGate.js";
import { AuditLog } from "../audit/AuditLog.js";
import { KeyManager, ToolCallRequest, VirtualKey } from "../auth/KeyManager.js";
import { RequestPipeline } from "./RequestPipeline.js";
import { ResponsePipeline } from "./ResponsePipeline.js";

export interface ProxyConfig {
    upstreamUrl?: string;
    upstreamCommand?: string;
}

export class SentinelProxy {
    private upstream!: MCPClient;
    private server: MCPServer;
    private upstreamProcess?: ChildProcess;

    constructor(
        private config: ProxyConfig,
        private requestPipeline: RequestPipeline,
        private responsePipeline: ResponsePipeline,
        private auditLog: AuditLog,
        private approvalGate: ApprovalGate,
        transport: Transport, // The transport exposed to the real client
        private keyManager?: KeyManager
    ) {
        this.server = new MCPServer(transport, {
            serverInfo: { name: 'mcp-sentinel', version: '1.0.0' }
        });
        
        const router = this.server.getRouter();
        router.on('tools/list', this.handleListTools.bind(this));
        router.on('tools/call', async (params) => this.handleToolCall(params as { name: string; arguments?: Record<string, unknown>; headers?: Record<string, string> }));
        router.on('resources/list', this.handleListResources.bind(this));
        router.on('prompts/list', this.handleListPrompts.bind(this));
    }

    async start(): Promise<void> {
        logger.info('Starting Sentinel proxy');
        
        let upstreamTransport: Transport;
        
        if (this.config.upstreamUrl) {
            upstreamTransport = new StreamableHTTPTransport({ url: this.config.upstreamUrl });
        } else if (this.config.upstreamCommand) {
            const [cmd, ...args] = this.config.upstreamCommand.split(' ');
            if (!cmd) {
                throw new Error("Proxy config upstream command is empty");
            }
            this.upstreamProcess = spawn(cmd, args, { env: process.env });
            if (!this.upstreamProcess.stdout || !this.upstreamProcess.stdin) {
                throw new Error("Failed to attach stdio to upstream process");
            }
            upstreamTransport = new StdioTransport(this.upstreamProcess.stdout, this.upstreamProcess.stdin);
        } else {
            throw new Error("Proxy config missing upstream URL or command");
        }

        this.upstream = new MCPClient(upstreamTransport, {
            clientInfo: { name: 'sentinel-proxy', version: '1.0.0' }
        });

        await this.upstream.connect();
        await this.server.start();
    }

    async stop(): Promise<void> {
        logger.info('Stopping Sentinel proxy');
        await this.server.stop();
        if (this.upstream) {
            await this.upstream.disconnect();
        }
        if (this.upstreamProcess) {
            this.upstreamProcess.kill();
        }
    }

    private async handleListTools(): Promise<{ tools: unknown[] }> {
         return this.upstream.listTools();
    }

    private async handleListResources(): Promise<{ resources: unknown[] }> {
         return this.upstream.listResources();
    }

    private async handleListPrompts(): Promise<{ prompts: unknown[] }> {
         return this.upstream.listPrompts();
    }

    private async handleToolCall(params: { name: string; arguments?: Record<string, unknown>; headers?: Record<string, string> }): Promise<ToolCallResult> {
        const req: ToolCallRequest = {
            tool: params.name,
            input: params.arguments || {},
            headers: params.headers ?? {}
        };

        const headerValue = req.headers["authorization"] ?? req.headers["Authorization"];
        const bearer = headerValue?.startsWith("Bearer ") ? headerValue.slice("Bearer ".length) : undefined;
        const key = this.resolveVirtualKey(bearer);

        const decision = await this.requestPipeline.process(req, { key });
        
        if (decision.action === 'deny') {
             this.auditLog.record({ key, request: req, decision: 'deny', error: decision.reason });
             throw new Error(`Sentinel denied call: ${decision.reason}`);
        }
        
        let finalReq = req;
        
        if (decision.action === 'transform') {
             finalReq = decision.request;
        }
        
        if (decision.action === 'require_approval') {
             const approval = await this.approvalGate.hold(finalReq, { channels: ['default'], timeout: '5m', on_timeout: 'deny' });
             if (approval !== 'approved') {
                 this.auditLog.record({ key, request: req, decision: 'deny', error: 'Approval denied or timed out' });
                 throw new Error('Sentinel denied call: Approval failed');
             }
        }
        
        const start = Date.now();
        try {
             let response = await this.upstream.callTool(finalReq.tool, finalReq.input as Record<string, unknown>);
             
             response = await this.responsePipeline.process(response, { key });
             
             this.auditLog.record({ key, request: req, decision: 'allow', durationMs: Date.now() - start });
             return response;
        } catch (error: unknown) {
             const message = error instanceof Error ? error.message : "Unknown upstream error";
             this.auditLog.record({ key, request: req, decision: 'allow', isError: true, error: message, durationMs: Date.now() - start });
             throw error;
        }
    }

    private resolveVirtualKey(rawKey?: string): VirtualKey {
        if (rawKey && this.keyManager) {
            const key = this.keyManager.validate(rawKey);
            if (key) {
                return key;
            }
        }

        return {
            id: "anonymous",
            name: "anonymous",
            tags: ["anonymous"],
            createdAt: new Date(),
            allowedTools: [],
            isRevoked: false
        };
    }
}
