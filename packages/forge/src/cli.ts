#!/usr/bin/env node

import { Command } from 'commander';
import { ForgeEngine } from './engine/ForgeEngine.js';
import { parsePipelineFile } from './dsl/parser.js';
import { logger } from '@oaslananka/shared';
import { ApiServer } from './server/ApiServer.js';
import { RunStore } from './runtime/RunStore.js';
import path from 'path';
import fs from 'fs/promises';

const program = new Command();

program
    .name('forge')
    .description('Chain MCP tools into declarative pipelines')
  .version('1.0.0');

program.command('run')
    .description('Run a pipeline from a YAML file')
    .argument('<file>', 'path to pipeline.yaml')
    .option('--dry-run', 'simulate execution without calling tools', false)
    .option('--vars <vars...>', 'pipeline variables (KEY=VAL)')
    .action(async (file: string, options: { dryRun: boolean, vars?: string[] }) => {
        const engine = new ForgeEngine({ dbPath: process.env['FORGE_DB_PATH'] || ':memory:' });
        try {
            const varsRecord: Record<string, string> = {};
            if (options.vars) {
                options.vars.forEach(v => {
                    const [key, val] = v.split('=');
                    if (key && val) {
                        varsRecord[key] = val;
                    }
                });
            }
            
            const run = await engine.runFile(path.resolve(file), varsRecord, options.dryRun);
            logger.info(`Run completed with status: ${run.status}`);
            if (run.error) logger.error(`Error: ${run.error}`);
        } catch (error: unknown) {
            logger.error({ err: error }, "Failed to run pipeline");
        } finally {
            await engine.stop();
        }
    });

program.command('validate')
    .description('Validate a pipeline YAML file')
    .argument('<file>', 'path to pipeline.yaml')
    .action(async (file: string) => {
        try {
            const config = await parsePipelineFile(path.resolve(file));
            logger.info(`Pipeline '${config.name}' is valid.`);
        } catch (error: unknown) {
            logger.error({ err: error }, "Validation failed");
        }
    });

program.command('ls')
    .description('List saved pipelines')
    .action(async () => {
        const store = new RunStore(process.env['FORGE_DB_PATH'] || ':memory:');
        const pipelines = store.listPipelines();
        logger.info(`Found ${pipelines.length} pipelines`);
        pipelines.forEach((pipeline) => logger.info(`- ${String(pipeline["name"] ?? "unnamed")}`));
        store.close();
    });

program.command('history')
    .description('Show run history')
    .option('--pipeline <name>', 'filter by pipeline name')
    .option('--limit <n>', 'limit results', '20')
    .action(async (options: { pipeline?: string, limit: string }) => {
        const store = new RunStore(process.env['FORGE_DB_PATH'] || ':memory:');
        const runs = store.listRuns(options.pipeline, parseInt(options.limit, 10));
        logger.info(`Found ${runs.length} runs`);
        runs.forEach(r => logger.info(`- Run ${r.id}: ${r.status} (${r.pipeline_name})`));
        store.close();
    });

program.command('serve')
    .description('Start API server and UI')
    .option('--port <port>', 'Port to listen on', '4000')
    .action(async (options: { port: string }) => {
        const engine = new ForgeEngine({ dbPath: process.env['FORGE_DB_PATH'] || ':memory:' });
        const store = new RunStore(process.env['FORGE_DB_PATH'] || ':memory:');
        const server = new ApiServer(engine, store);

        await engine.start();
        await server.listen(parseInt(options.port, 10));

        const shutdown = async () => {
            logger.info("Shutting down Forge server...");
            await server.close();
            await engine.stop();
            process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    });

program.command('init')
    .description('Scaffold new pipeline')
    .argument('<name>', 'Pipeline name')
    .action(async (name: string) => {
        const scaffold = `
name: "${name}"
version: "1.0.0"
servers: {}
steps:
  - id: "hello"
    type: "log"
    message: "Pipeline ${name} initialized!"
`;
        const filePath = path.resolve(`${name}.yaml`);
        await fs.writeFile(filePath, scaffold.trim());
        logger.info(`Initialized pipeline at ${filePath}`);
    });

program.parse();
