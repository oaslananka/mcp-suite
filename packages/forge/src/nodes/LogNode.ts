import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';
import { Transformer } from '../engine/Transformer.js';

export class LogNode extends BaseNode {
    private transformer = new Transformer();

    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('message' in step)) return { status: 'failed', error: 'Missing message definition' };
        
        try {
             const message = this.transformer.transform(step.message as string, ctx.dataBus.toTemplateContext());
             const level = step.level || 'info';
             
             if (level === 'debug') {
                 ctx.logger.debug(message);
             } else if (level === 'info') {
                 ctx.logger.info(message);
             } else if (level === 'warn') {
                 ctx.logger.warn(message);
             } else if (level === 'error') {
                 ctx.logger.error(message);
             }
             
             return { status: 'success', output: message };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
