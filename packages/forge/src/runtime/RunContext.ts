import { DataBus } from '../engine/DataBus.js';
import { ConnectionManager } from '../connections/ConnectionManager.js';
import { ServerConfig } from '../dsl/schema.js';
import { logger, Logger } from '@oaslananka/shared';

export class RunContext {
    dataBus: DataBus = new DataBus();
    logger: Logger;
    
    // We add these so nodes can access servers
    connectionManager: ConnectionManager;
    private serversConfig: Record<string, ServerConfig>;

    constructor(
        public readonly runId: string,
        public readonly pipelineId: string,
        private readonly vars: Record<string, string>,
        connectionManager?: ConnectionManager,
        serversConfig?: Record<string, ServerConfig>
    ) {
        this.logger = logger.child({ runId, pipelineId });
        
        // Initialize DataBus with vars
        for (const [k, v] of Object.entries(this.vars)) {
            this.dataBus.set(k, v);
        }

        // Normally provided by Executor/Engine
        this.connectionManager = connectionManager || new ConnectionManager();
        this.serversConfig = serversConfig || {};
    }

    getServerConfig(name: string): ServerConfig {
        const conf = this.serversConfig[name];
        if (!conf) {
            throw new Error(`Server config not found for: ${name}`);
        }
        return conf;
    }
}
