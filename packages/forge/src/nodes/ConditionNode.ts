import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';
import { ConditionEval } from '../engine/ConditionEval.js';

export class ConditionNode extends BaseNode {
    private evaluator = new ConditionEval();

    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('condition' in step)) return { status: 'failed', error: 'Missing condition definition' };
        
        try {
             const isTrue = this.evaluator.evaluate(step.condition, ctx.dataBus.toTemplateContext());
             ctx.logger.info(`Condition '${step.condition}' evaluated to ${isTrue}`);
             
             // Return the selected branch to the Executor
             return { 
                 status: 'success', 
                 output: isTrue,
                 nextStepIds: [isTrue ? step.on_true : step.on_false] 
             };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
