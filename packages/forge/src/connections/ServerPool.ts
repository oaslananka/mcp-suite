import { MCPClient, logger } from '@oaslananka/shared';

interface PoolEntry {
    client: MCPClient;
    lastUsed: number;
    inUse: boolean;
}

export class ServerPool {
    private pools: Map<string, PoolEntry[]> = new Map();
    private maxSize: number;
    private idleTimeoutMs: number;

    constructor(maxSize = 5, idleTimeoutMs = 300000) {
        this.maxSize = maxSize;
        this.idleTimeoutMs = idleTimeoutMs;
        
        setInterval(() => this.cleanupIdleConnections(), 60000); // Check every minute
    }

    async acquire(serverName: string, createFn: () => Promise<MCPClient>): Promise<MCPClient> {
        let pool = this.pools.get(serverName);
        if (!pool) {
            pool = [];
            this.pools.set(serverName, pool);
        }

        // Find available connection
        const available = pool.find(entry => !entry.inUse);
        if (available) {
            available.inUse = true;
            available.lastUsed = Date.now();
            return available.client;
        }

        // Create new if below max
        if (pool.length < this.maxSize) {
            const client = await createFn();
            pool.push({ client, inUse: true, lastUsed: Date.now() });
            return client;
        }

        // Wait for an available connection (simple polling for demonstration)
        return new Promise((resolve) => {
             const interval = setInterval(() => {
                 const entry = pool.find(e => !e.inUse);
                 if (entry) {
                     clearInterval(interval);
                     entry.inUse = true;
                     entry.lastUsed = Date.now();
                     resolve(entry.client);
                 }
             }, 100);
        });
    }

    release(serverName: string, client: MCPClient): void {
        const pool = this.pools.get(serverName);
        if (pool) {
            const entry = pool.find(e => e.client === client);
            if (entry) {
                entry.inUse = false;
                entry.lastUsed = Date.now();
            }
        }
    }

    async shutdown(): Promise<void> {
        for (const [name, pool] of this.pools.entries()) {
            for (const entry of pool) {
                try {
                    await entry.client.disconnect();
                } catch (e) {
                    logger.error({ err: e, name }, "Error disconnecting pooled client");
                }
            }
        }
        this.pools.clear();
    }

    private cleanupIdleConnections(): void {
        const now = Date.now();
        for (const [name, pool] of this.pools.entries()) {
            const activePool = pool.filter(entry => {
                if (!entry.inUse && now - entry.lastUsed > this.idleTimeoutMs) {
                    logger.info(`Cleaning up idle connection for server ${name}`);
                    entry.client.disconnect().catch(e => logger.error({ err: e, name }, "Error closing idle connection"));
                    return false;
                }
                return true;
            });
            this.pools.set(name, activePool);
        }
    }
}
