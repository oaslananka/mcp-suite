import { SQLiteStore } from '../storage/SQLiteStore.js';
import { AlertManager, AnomalyResult } from '../alerts/AlertManager.js';
import { logger } from '@oaslananka/shared';

export interface BaselineStats {
    mean: number;
    stddev: number;
    p50: number;
    p95: number;
    p99: number;
}

export class AnomalyDetector {
    private intervalId?: NodeJS.Timeout;

    constructor() {}

    start(store: SQLiteStore, alertManager: AlertManager): void {
        this.intervalId = setInterval(() => {
            this.check(store, alertManager).catch(e => logger.error({ err: e }, "Anomaly check failed"));
        }, 60000); // 1 minute
    }

    stop(): void {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    private async check(store: SQLiteStore, alertManager: AlertManager): Promise<void> {
        const currentP99 = this.fetchCurrentP99(store);
        const baseline = this.computeBaseline('latency', 7, store);
        
        const anomaly = this.detectAnomaly(currentP99, baseline);
        
        if (anomaly) {
             await alertManager.trigger(anomaly);
        }
    }

    private fetchCurrentP99(store: SQLiteStore): number {
        return store.getP99Latency('*', 5);
    }

    private computeBaseline(metric: string, windowDays: number, store: SQLiteStore): BaselineStats {
        return store.computeBaseline(metric, windowDays);
    }

    private detectAnomaly(current: number, baseline: BaselineStats): AnomalyResult | null {
        const threshold = baseline.mean + (3 * baseline.stddev);
        if (current > threshold) {
            return {
                metric: 'latency',
                actualValue: current,
                expectedValue: baseline.mean,
                zScore: (current - baseline.mean) / baseline.stddev,
                serverName: 'example-server',
                toolName: 'example-tool',
                timestamp: new Date()
            };
        }
        return null;
    }
}
