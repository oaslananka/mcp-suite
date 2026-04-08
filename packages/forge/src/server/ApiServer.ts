import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Server } from 'http';
import type { ForgeEngine } from '../engine/ForgeEngine.js';
import type { PipelineConfig } from '../dsl/schema.js';
import type { RunStore } from '../runtime/RunStore.js';
import { logger } from '@oaslananka/shared';
import path from 'path';

export class ApiServer {
    private app: Express;
    private server?: Server;
    private wss?: WebSocketServer;

    constructor(private engine: ForgeEngine, private store: RunStore) {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
    }

    private setupRoutes(): void {
        const api = express.Router();

        this.app.get('/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok' });
        });

        api.get('/pipelines', (_req: Request, res: Response) => {
            const pipelines = this.store.listPipelines();
            res.json({ pipelines });
        });

        api.post('/pipelines', (_req: Request, res: Response) => {
            res.status(201).json({ status: 'saved' });
        });

        api.post('/pipelines/:id/run', async (req: Request, res: Response) => {
            try {
                const pipelineId = req.params['id'];
                if (!pipelineId) {
                    res.status(400).json({ error: 'Missing pipeline ID' });
                    return;
                }

                const vars = isStringRecord(req.body) && isStringRecord(req.body["vars"]) ? req.body["vars"] : {};
                const mockConfig: PipelineConfig = { name: pipelineId, version: "1", steps: [] };
                const run = await this.engine.run(mockConfig, vars);
                res.json(run);
            } catch (error: unknown) {
                res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
            }
        });

        api.get('/runs', (req: Request, res: Response) => {
            const pipelineId = req.query['pipelineId'] as string;
            const limit = parseInt(req.query['limit'] as string) || 20;
            const runs = this.store.listRuns(pipelineId, limit);
            res.json({ runs });
        });

        api.get('/runs/:id', (req: Request, res: Response) => {
            const id = req.params['id'];
            if (!id) {
                res.status(400).json({ error: 'Missing ID' });
                return;
            }
            const run = this.store.getRun(id);
            if (!run) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            const steps = this.store.getRunSteps(id);
            res.json({ run, steps });
        });

        this.app.use('/api', api);

        const uiPath = path.join(process.cwd(), 'dist', 'ui');
        this.app.use(express.static(uiPath));
        
        this.app.get('*', (_req, res) => {
             res.sendFile(path.join(uiPath, 'index.html'), (err) => {
                 if (err) {
                     res.status(404).send('UI not built yet');
                 }
             });
        });
        
        this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
            logger.error({ err }, "API Error");
            res.status(500).json({ error: err.message });
        });
    }

    async listen(port: number): Promise<void> {
        return new Promise((resolve) => {
            this.server = this.app.listen(port, () => {
                logger.info(`Forge API Server listening on port ${port}`);
                
                this.wss = new WebSocketServer({ server: this.server });
                this.wss.on('connection', (ws: WebSocket) => {
                     logger.info('WebSocket client connected');
                     ws.send(JSON.stringify({ type: 'connected' }));
                });
                
                resolve();
            });
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.wss) {
                this.wss.close();
            }
            if (this.server) {
                this.server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return typeof value === "object" && value !== null && Object.values(value).every((entry) => typeof entry === "string");
}
