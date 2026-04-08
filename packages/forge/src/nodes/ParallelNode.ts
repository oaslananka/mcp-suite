import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import { Step, type StepResult } from '../engine/Step.js';

export class ParallelNode extends BaseNode {
    async execute(stepConfig: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('steps' in stepConfig) || !Array.isArray(stepConfig.steps)) {
             return { status: 'failed', error: 'Parallel node missing steps array' };
        }

        const promises = stepConfig.steps.map(async (childConfig) => {
            const step = new Step(childConfig);
            const result = await step.execute(ctx);
            if (result.status === 'failed') {
                 throw new Error(`Parallel child step ${childConfig.id} failed: ${result.error}`);
            }
            return { id: childConfig.id, result: result.output };
        });

        try {
             const results = await Promise.all(promises);
             const combinedOutput = results.reduce((acc, { id, result }) => {
                 acc[id] = result;
                 return acc;
             }, {} as Record<string, unknown>);
             
             return { status: 'success', output: combinedOutput };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
