import { MCPServer } from "../server/MCPServer.js";
import { MockTransport } from "./MockTransport.js";
import { Methods } from "../protocol/methods.js";
import { Tool, Resource, Prompt, PromptMessage } from "../protocol/types.js";
import { ErrorCodes, MCPError } from "../protocol/errors.js";

export interface CallRecord {
    kind: "tool" | "resource" | "prompt";
    name: string;
    args?: unknown;
    at: number;
}

export class MockMCPServer {
    public server: MCPServer;
    public transport: MockTransport;

    public mockTools: Tool[] = [];
    public mockResources: Resource[] = [];
    public mockPrompts: Prompt[] = [];
    public latencyMs = 0;
    public history: CallRecord[] = [];
    private nextError: MCPError | undefined;

    // Simulate handlers
    public toolHandlers: Map<string, (args: unknown) => unknown> = new Map();
    public resourceHandlers: Map<string, () => unknown[]> = new Map();
    public promptHandlers: Map<string, (args: unknown) => PromptMessage[]> = new Map();

    constructor() {
        this.transport = new MockTransport();
        this.server = new MCPServer(this.transport, {
            serverInfo: { name: "mock-server", version: "1.0.0" },
            capabilities: {
                tools: {},
                resources: {},
                prompts: {}
            }
        });

        const router = this.server.getRouter();

        router.on(Methods.ToolsList, async () => ({
            tools: this.mockTools
        }));

        router.on(Methods.ToolsCall, async (params) => {
            const toolParams = params as { name: string; arguments?: unknown };
            const { name, arguments: args } = toolParams;
            this.history.push({ kind: "tool", name, args, at: Date.now() });
            await this.maybeDelay();
            this.maybeThrow();
            const handler = this.toolHandlers.get(name);
            if (!handler) {
                throw new MCPError(ErrorCodes.ToolNotFound, `Tool not found: ${name}`);
            }
            return await handler(args);
        });

        router.on(Methods.ResourcesList, async () => ({
            resources: this.mockResources
        }));

        router.on(Methods.ResourcesRead, async (params) => {
            const resourceParams = params as { uri: string };
            const { uri } = resourceParams;
            this.history.push({ kind: "resource", name: uri, at: Date.now() });
            await this.maybeDelay();
            this.maybeThrow();
            const handler = this.resourceHandlers.get(uri);
            if (!handler) {
                throw new MCPError(ErrorCodes.ResourceNotFound, `Resource not found: ${uri}`);
            }
            return { contents: await handler() };
        });

        router.on(Methods.PromptsList, async () => ({
            prompts: this.mockPrompts
        }));

        router.on(Methods.PromptsGet, async (params) => {
            const promptParams = params as { name: string; arguments?: unknown };
            const { name, arguments: args } = promptParams;
            this.history.push({ kind: "prompt", name, args, at: Date.now() });
            await this.maybeDelay();
            this.maybeThrow();
            const handler = this.promptHandlers.get(name);
            if (!handler) {
                throw new MCPError(ErrorCodes.PromptNotFound, `Prompt not found: ${name}`);
            }
            return { messages: await handler(args) };
        });
    }

    public simulateLatency(ms: number): void {
        this.latencyMs = Math.max(0, ms);
    }

    public simulateError(code: number, message: string): void {
        this.nextError = new MCPError(code, message);
    }

    public assertToolCalled(name: string, args?: unknown): void {
        const match = this.history.find((entry) => entry.kind === "tool" && entry.name === name);
        if (!match) {
            throw new Error(`Expected tool '${name}' to be called`);
        }

        if (args !== undefined) {
            const actualSerialized = JSON.stringify(match.args);
            const expectedSerialized = JSON.stringify(args);
            if (actualSerialized !== expectedSerialized) {
                throw new Error(
                    `Expected tool '${name}' args ${expectedSerialized}, received ${actualSerialized}`
                );
            }
        }
    }

    public captureHistory(): CallRecord[] {
        return [...this.history];
    }

    public async start(): Promise<void> {
        await this.server.start();
    }

    public async stop(): Promise<void> {
        await this.server.stop();
    }

    private async maybeDelay(): Promise<void> {
        if (this.latencyMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
        }
    }

    private maybeThrow(): void {
        if (!this.nextError) {
            return;
        }

        const error = this.nextError;
        this.nextError = undefined;
        throw error;
    }
}
