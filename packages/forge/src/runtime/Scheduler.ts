import cron from 'node-cron';
import { ForgeEngine } from '../engine/ForgeEngine.js';
import { PipelineConfig } from '../dsl/schema.js';
import { logger } from '@oaslananka/shared';

export class Scheduler {
    private engine: ForgeEngine;
    private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

    constructor(engine: ForgeEngine) {
        this.engine = engine;
    }

    scheduleAll(pipelines: PipelineConfig[]): void {
        this.unscheduleAll();
        
        for (const pipeline of pipelines) {
            if (!pipeline.triggers) continue;

            for (const trigger of pipeline.triggers) {
                if (trigger.type === 'cron') {
                    logger.info(`Scheduling pipeline ${pipeline.name} with cron ${trigger.schedule}`);
                    
                    const task = cron.schedule(trigger.schedule, async () => {
                        logger.info(`Triggering cron scheduled pipeline: ${pipeline.name}`);
                        try {
                            await this.engine.run(pipeline, {}, false);
                        } catch (error) {
                            logger.error({ error }, `Cron execution failed for ${pipeline.name}`);
                        }
                    });
                    
                    this.scheduledTasks.set(`${pipeline.name}-${trigger.schedule}`, task);
                } else if (trigger.type === 'webhook') {
                    logger.info(`Webhook trigger configured for ${pipeline.name} at ${trigger.path}`);
                    // In a real implementation this would register with ApiServer
                }
            }
        }
    }

    unscheduleAll(): void {
        for (const task of this.scheduledTasks.values()) {
            task.stop();
        }
        this.scheduledTasks.clear();
    }
}
