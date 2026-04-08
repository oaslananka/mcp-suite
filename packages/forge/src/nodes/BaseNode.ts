import { StepConfig } from '../dsl/schema.js';
import { RunContext } from '../runtime/RunContext.js';
import { StepResult } from '../engine/Step.js';

export abstract class BaseNode {
    abstract execute(step: StepConfig, ctx: RunContext): Promise<StepResult>;
}
