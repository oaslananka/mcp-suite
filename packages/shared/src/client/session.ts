import { MCPClient, MCPClientOptions } from "./MCPClient.js";
import { Transport } from "../transport/transport.js";
import { Tool, Resource, Prompt, ToolCallResult } from "../protocol/types.js";

export class MCPSession {
    private client: MCPClient;

    public tools: Tool[] = [];
    public resources: Resource[] = [];
    public prompts: Prompt[] = [];

    constructor(transport: Transport, options: MCPClientOptions) {
        this.client = new MCPClient(transport, options);
    }

    public async start(): Promise<void> {
        await this.client.connect();
        
        // Fetch initial state
        await this.syncTools();
        await this.syncResources();
        await this.syncPrompts();
    }

    public async stop(): Promise<void> {
        await this.client.disconnect();
    }

    public async syncTools(): Promise<void> {
        try {
            const result = await this.client.listTools();
            this.tools = result.tools;
        } catch (err) {
            console.error("Failed to sync tools", err);
        }
    }

    public async syncResources(): Promise<void> {
        try {
            const result = await this.client.listResources();
            this.resources = result.resources;
        } catch (err) {
            console.error("Failed to sync resources", err);
        }
    }

    public async syncPrompts(): Promise<void> {
        try {
            const result = await this.client.listPrompts();
            this.prompts = result.prompts;
        } catch (err) {
            console.error("Failed to sync prompts", err);
        }
    }

    public async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
        return this.client.callTool(name, args);
    }
}
