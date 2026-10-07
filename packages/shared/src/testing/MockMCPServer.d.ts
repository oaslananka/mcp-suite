import { MCPServer } from "../server/MCPServer.js";
import { MockTransport } from "./MockTransport.js";
import { Tool, Resource, Prompt, PromptMessage } from "../protocol/types.js";
export interface CallRecord {
    kind: "tool" | "resource" | "prompt";
    name: string;
    args?: unknown;
    at: number;
}
export declare class MockMCPServer {
    server: MCPServer;
    transport: MockTransport;
    mockTools: Tool[];
    mockResources: Resource[];
    mockPrompts: Prompt[];
    latencyMs: number;
    history: CallRecord[];
    private nextError;
    toolHandlers: Map<string, (args: unknown) => unknown>;
    resourceHandlers: Map<string, () => unknown[]>;
    promptHandlers: Map<string, (args: unknown) => PromptMessage[]>;
    constructor();
    simulateLatency(ms: number): void;
    simulateError(code: number, message: string): void;
    assertToolCalled(name: string, args?: unknown): void;
    captureHistory(): CallRecord[];
    start(): Promise<void>;
    stop(): Promise<void>;
    private maybeDelay;
    private maybeThrow;
}
//# sourceMappingURL=MockMCPServer.d.ts.map