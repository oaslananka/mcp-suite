import Database from 'better-sqlite3';
import type { PipelineConfig } from '../dsl/schema.js';

export type RunStatus = 'queued' | 'running' | 'success' | 'failed';
export type StepStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped';

export interface PipelineRunRecord {
    id: string;
    pipeline_id: string;
    pipeline_name: string;
    status: RunStatus;
    error: string | null;
    started_at: string;
    completed_at: string | null;
}

export interface StepRecord {
    id: string;
    run_id: string;
    step_id: string;
    step_name: string;
    status: StepStatus;
    error: string | null;
    input_json: string | null;
    output_json: string | null;
    started_at: string;
    completed_at: string | null;
}

export class RunStore {
    private db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                pipeline_id TEXT NOT NULL,
                pipeline_name TEXT NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            );
            
            CREATE TABLE IF NOT EXISTS run_steps (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                step_id TEXT NOT NULL,
                step_name TEXT,
                status TEXT NOT NULL,
                error TEXT,
                input_json TEXT,
                output_json TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE
            );
        `);
    }

    public createRun(runId: string, pipelineId: string, pipelineName: string): void {
        const stmt = this.db.prepare(
            `INSERT INTO runs (id, pipeline_id, pipeline_name, status) VALUES (?, ?, ?, 'running')`
        );
        stmt.run(runId, pipelineId, pipelineName);
    }

    public updateRun(runId: string, status: RunStatus, error?: string): void {
        const stmt = this.db.prepare(
            `UPDATE runs SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
        );
        stmt.run(status, error || null, runId);
    }

    public createStep(runId: string, stepId: string, stepName: string = ''): string {
        const id = `${runId}-${stepId}-${Date.now()}`;
        const stmt = this.db.prepare(
            `INSERT INTO run_steps (id, run_id, step_id, step_name, status) VALUES (?, ?, ?, ?, 'running')`
        );
        stmt.run(id, runId, stepId, stepName);
        return id;
    }

    public updateStep(id: string, status: StepStatus, output?: unknown, error?: string): void {
        const outputJson = output ? JSON.stringify(output) : null;
        const stmt = this.db.prepare(
            `UPDATE run_steps SET status = ?, output_json = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
        );
        stmt.run(status, outputJson, error || null, id);
    }

    public listRuns(pipelineId?: string, limit: number = 20): PipelineRunRecord[] {
        if (pipelineId) {
            const stmt = this.db.prepare(`SELECT * FROM runs WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT ?`);
            return stmt.all(pipelineId, limit) as PipelineRunRecord[];
        }
        const stmt = this.db.prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`);
        return stmt.all(limit) as PipelineRunRecord[];
    }

    public getRun(runId: string): PipelineRunRecord | null {
        const stmt = this.db.prepare(`SELECT * FROM runs WHERE id = ?`);
        return stmt.get(runId) as PipelineRunRecord | null;
    }

    public getRunSteps(runId: string): StepRecord[] {
        const stmt = this.db.prepare(`SELECT * FROM run_steps WHERE run_id = ? ORDER BY started_at ASC`);
        return stmt.all(runId) as StepRecord[];
    }

    public listPipelines(): PipelineConfig[] {
        // Should fetch unique pipeline configs or from a separate pipelines table
        // For now returning empty to satisfy Engine start
        return [];
    }

    public close(): void {
        this.db.close();
    }
}
