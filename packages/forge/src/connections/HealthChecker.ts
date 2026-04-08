import { EventEmitter } from 'events';
import { ConnectionManager } from './ConnectionManager.js';
import type { ServerConfig } from '../dsl/schema.js';
import { logger } from '@oaslananka/shared';

interface HealthStatus {
    isHealthy: boolean;
    consecutiveFailures: number;
    lastChecked: number;
}

export class HealthChecker extends EventEmitter {
    private servers: Map<string, ServerConfig> = new Map();
    private statuses: Map<string, HealthStatus> = new Map();
    private intervalId?: NodeJS.Timeout;

    constructor(private connectionManager: ConnectionManager, private checkIntervalMs = 30000) {
        super();
    }

    addServer(name: string, config: ServerConfig): void {
        this.servers.set(name, config);
        this.statuses.set(name, { isHealthy: true, consecutiveFailures: 0, lastChecked: Date.now() });
    }

    start(): void {
        this.intervalId = setInterval(() => {
            void this.checkAll().catch((error: unknown) => logger.error({ err: error }, "Health check fail"));
        }, this.checkIntervalMs);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    async checkAll(): Promise<void> {
        for (const [name, config] of this.servers.entries()) {
            await this.checkServer(name, config);
        }
    }

    private async checkServer(name: string, config: ServerConfig): Promise<void> {
        const status = this.statuses.get(name);
        if (!status) {
            return;
        }
        
        try {
            const client = await this.connectionManager.getClient(name, config);
            await client.ping();
            
            if (!status.isHealthy) {
                logger.info(`Server ${name} recovered`);
                this.emit('recovered', name);
            }
            
            status.isHealthy = true;
            status.consecutiveFailures = 0;
            status.lastChecked = Date.now();
        } catch (error: unknown) {
            status.consecutiveFailures++;
            logger.warn({ error, name, failures: status.consecutiveFailures }, `Health check failed for server`);
            
            if (status.isHealthy && status.consecutiveFailures >= 3) {
                logger.error(`Server ${name} marked as unhealthy`);
                status.isHealthy = false;
                this.emit('unhealthy', name);
            }
        }
    }

    isHealthy(name: string): boolean {
        return this.statuses.get(name)?.isHealthy ?? false;
    }
}
