import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';

export class DelayNode extends BaseNode {
    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('duration' in step)) return { status: 'failed', error: 'Missing duration definition' };
        
        try {
             const ms = this.parseDuration(step.duration as string);
             ctx.logger.info(`Delaying for ${ms}ms`);
             await new Promise(resolve => setTimeout(resolve, ms));
             return { status: 'success', output: `Delayed ${ms}ms` };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }

    private parseDuration(duration: string): number {
        const value = parseInt(duration, 10);
        if (isNaN(value)) throw new Error(`Invalid duration format: ${duration}`);
        
        if (duration.endsWith('ms')) return value;
        if (duration.endsWith('s')) return value * 1000;
        if (duration.endsWith('m')) return value * 60000;
        if (duration.endsWith('h')) return value * 3600000;
        
        throw new Error(`Invalid duration unit: ${duration}`);
    }
}
