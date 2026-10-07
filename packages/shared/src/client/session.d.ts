import { MCPClientOptions } from "./MCPClient.js";
import { Transport } from "../transport/transport.js";
import { Tool, Resource, Prompt, ToolCallResult } from "../protocol/types.js";
export declare class MCPSession {
    private client;
    tools: Tool[];
    resources: Resource[];
    prompts: Prompt[];
    constructor(transport: Transport, options: MCPClientOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    syncTools(): Promise<void>;
    syncResources(): Promise<void>;
    syncPrompts(): Promise<void>;
    callTool(name: string, args?: Record<string, unknown>): Promise<ToolCallResult>;
}
//# sourceMappingURL=session.d.ts.map