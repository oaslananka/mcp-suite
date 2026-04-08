import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';
import { Transformer } from '../engine/Transformer.js';
import type { MCPClient, ToolCallResult } from '@oaslananka/shared';

export class ToolCallNode extends BaseNode {
    private transformer = new Transformer();

    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('tool' in step)) throw new Error("Not a tool call step");
        
        const serverName = step.server;
        const toolName = step.tool;
        const rawInput = step.input;
        
        ctx.logger.info(`Resolving inputs for tool ${toolName} on server ${serverName}`);
        
        const resolvedInput = this.resolveInput(rawInput, ctx);
        
        ctx.logger.info({ resolvedInput }, `Calling tool ${toolName}`);

        try {
            // Using connectionManager from context (assuming it's passed or available globally for now)
            // Wait, we need the client. Executor needs to pass it or we need a way to get it.
            // For now, assume ctx has access to connectionManager or client directly
            const client = await ctx.connectionManager.getClient(serverName, ctx.getServerConfig(serverName));
            
            const result = await this.executeWithRetry(client, toolName, resolvedInput, step.retry);
            
            if (result.isError) {
                return { status: 'failed', error: 'Tool execution returned error', output: result };
            }
            
            return { status: 'success', output: result };
        } catch (error: unknown) {
            return { status: 'failed', error: error instanceof Error ? error.message : 'Tool call failed' };
        }
    }

    private resolveInput(input: Record<string, unknown>, ctx: RunContext): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const templateContext = ctx.dataBus.toTemplateContext();

        for (const [key, value] of Object.entries(input)) {
            if (typeof value === 'string' && value.includes('{{')) {
                result[key] = this.transformer.transform(value, templateContext);
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.resolveInput(value as Record<string, unknown>, ctx);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    private async executeWithRetry(client: MCPClient, toolName: string, input: Record<string, unknown>, retryConfig?: { max_attempts?: number }): Promise<ToolCallResult> {
        let attempts = 0;
        const maxAttempts = retryConfig?.max_attempts || 1;
        
        while (true) {
            try {
                return await client.callTool(toolName, input);
            } catch (err) {
                attempts++;
                if (attempts >= maxAttempts) throw err;
                
                // Simple exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
}
