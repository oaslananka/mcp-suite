import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import { Step, type StepResult } from '../engine/Step.js';
import { Transformer } from '../engine/Transformer.js';

export class LoopNode extends BaseNode {
    private transformer = new Transformer();

    async execute(stepConfig: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('over' in stepConfig) || !('as' in stepConfig) || !('steps' in stepConfig)) {
             return { status: 'failed', error: 'Loop node missing over, as, or steps array' };
        }

        try {
             const items = this.transformer.transform(stepConfig.over as string, ctx.dataBus.toTemplateContext());
             if (!Array.isArray(items)) {
                 return { status: 'failed', error: `Loop 'over' expression did not evaluate to an array: ${stepConfig.over}` };
             }

             const loopResults = [];
             for (let i = 0; i < items.length; i++) {
                 const item = items[i];
                 ctx.dataBus.set(stepConfig.as as string, item);
                 
                 const iterResults: Record<string, unknown> = {};
                 for (const childConfig of stepConfig.steps as StepConfig[]) {
                     const step = new Step(childConfig);
                     const result = await step.execute(ctx);
                     if (result.status === 'failed') {
                          throw new Error(`Loop step ${childConfig.id} failed on iteration ${i}: ${result.error}`);
                     }
                     if (childConfig.output_as) {
                         ctx.dataBus.set(childConfig.output_as, result.output);
                     }
                     iterResults[childConfig.id] = result.output;
                 }
                 loopResults.push(iterResults);
             }

             return { status: 'success', output: loopResults };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
