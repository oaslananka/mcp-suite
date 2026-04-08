import type { RunContext } from "../runtime/RunContext.js";
import type { StepConfig } from "../dsl/schema.js";
import type { BaseNode } from "../nodes/BaseNode.js";
import { createNode } from "../nodes/factory.js";

export interface StepResult {
    status: 'success' | 'failed' | 'skipped';
    output?: unknown;
    error?: string;
    nextStepIds?: string[];
}

export class Step {
    private config: StepConfig;
    private node: BaseNode;

    constructor(config: StepConfig) {
        this.config = config;
        this.node = createNode(config);
    }

    async execute(ctx: RunContext): Promise<StepResult> {
        try {
            return await this.node.execute(this.config, ctx);
        } catch (error: unknown) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
