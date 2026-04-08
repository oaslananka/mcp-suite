import type { ConnectionManager } from "../connections/ConnectionManager.js";
import type { RunStore } from "../runtime/RunStore.js";
import type { RunContext } from "../runtime/RunContext.js";
import type { Pipeline } from "./Pipeline.js";
import { Step, type StepResult } from "./Step.js";

export class Executor {
    constructor(
        private connectionManager: ConnectionManager,
        private runStore: RunStore,
        private dryRun: boolean = false
    ) {}

    async execute(pipeline: Pipeline, ctx: RunContext): Promise<void> {
        const order = pipeline.getExecutionOrder();

        for (const group of order) {
            if (group.length === 1) {
                await this.executeSerial(group, pipeline, ctx);
            } else {
                await this.executeParallel(group, pipeline, ctx);
            }
        }
        
        // Satisfy typescript unused prop
        void this.connectionManager;
        void this.runStore;
    }

    private async executeSerial(stepIds: string[], pipeline: Pipeline, ctx: RunContext): Promise<void> {
        for (const id of stepIds) {
            const config = pipeline.getStep(id);
            if (!config) continue;

            const step = new Step(config);
            
            ctx.logger.info(`Executing step: ${id}`);
            
            if (this.dryRun) {
                ctx.logger.info(`[DryRun] Step ${id} skipped`);
                continue;
            }

            const result = await step.execute(ctx);
            
            if (result.status === 'failed') {
                throw new Error(`Step ${id} failed: ${result.error}`);
            }

            if (result.output && config.output_as) {
                ctx.dataBus.set(config.output_as, result.output);
            }
        }
    }

    private async executeParallel(stepIds: string[], pipeline: Pipeline, ctx: RunContext): Promise<void> {
        const promises = stepIds.map(id => {
            const config = pipeline.getStep(id);
            if (!config) return Promise.resolve();
            const step = new Step(config);
            return step.execute(ctx).then((result: StepResult) => {
                if (result.status === 'failed') {
                     throw new Error(`Parallel step ${id} failed: ${result.error}`);
                }
                if (result.output && config.output_as) {
                    ctx.dataBus.set(config.output_as, result.output);
                }
            });
        });

        await Promise.all(promises);
    }

    async handleGlobalError(_onErrorConfig: unknown, ctx: RunContext, error: unknown): Promise<void> {
        ctx.logger.error({ err: error }, "Global error handler triggered");
        // Implement global error fallback logic (like a Slack notification)
    }
}
