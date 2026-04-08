import { ConnectionManager } from "../connections/ConnectionManager.js";
import { RunStore } from "../runtime/RunStore.js";
import { Scheduler } from "../runtime/Scheduler.js";
import type { PipelineConfig } from "../dsl/schema.js";
import { parsePipelineFile } from "../dsl/parser.js";
import { Pipeline } from "./Pipeline.js";
import { Executor } from "./Executor.js";
import { RunContext } from "../runtime/RunContext.js";
import { logger } from "@oaslananka/shared";
import { v4 as uuidv4 } from "uuid";

export interface ForgeEngineOptions {
    dbPath: string;
}

export interface PipelineRun {
    id: string;
    pipelineId: string;
    status: 'success' | 'failed';
    error?: string;
}

export class ForgeEngine {
    private connectionManager: ConnectionManager;
    private runStore: RunStore;
    private scheduler: Scheduler;

    constructor(options: ForgeEngineOptions) {
        this.runStore = new RunStore(options.dbPath);
        this.connectionManager = new ConnectionManager();
        this.scheduler = new Scheduler(this);
    }

    async start(): Promise<void> {
        logger.info("Starting Forge Engine");
        // Load pipelines from store and schedule them
        const pipelines = this.runStore.listPipelines();
        this.scheduler.scheduleAll(pipelines);
    }

    async stop(): Promise<void> {
        logger.info("Stopping Forge Engine");
        this.scheduler.unscheduleAll();
        await this.connectionManager.shutdown();
        this.runStore.close();
    }

    async runFile(path: string, vars?: Record<string, string>, dryRun?: boolean): Promise<PipelineRun> {
        const config = await parsePipelineFile(path);
        return this.run(config, vars, dryRun);
    }

    async run(config: PipelineConfig, vars?: Record<string, string>, dryRun?: boolean): Promise<PipelineRun> {
        const pipeline = new Pipeline(config);
        pipeline.validate();
        
        const runId = uuidv4();
        const ctx = new RunContext(runId, config.name, vars || {}, this.connectionManager, config.servers);
        
        this.runStore.createRun(runId, config.name, config.name);
        
        const executor = new Executor(this.connectionManager, this.runStore, dryRun);
        
        try {
            await executor.execute(pipeline, ctx);
            this.runStore.updateRun(runId, 'success');
            return { id: runId, pipelineId: config.name, status: 'success' };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ err: error, runId }, "Pipeline run failed");
            this.runStore.updateRun(runId, 'failed', errorMessage);
            
            if (config.on_error) {
                await executor.handleGlobalError(config.on_error, ctx, error);
            }
            
            return { id: runId, pipelineId: config.name, status: 'failed', error: errorMessage };
        }
    }
}
