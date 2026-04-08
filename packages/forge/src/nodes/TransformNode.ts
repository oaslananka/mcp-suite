import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';
import { Transformer } from '../engine/Transformer.js';

export class TransformNode extends BaseNode {
    private transformer = new Transformer();

    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('transform' in step)) return { status: 'failed', error: 'Missing transform definition' };
        
        try {
             const result = this.transformer.transform(step.transform as string, ctx.dataBus.toTemplateContext());
             return { status: 'success', output: result };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
