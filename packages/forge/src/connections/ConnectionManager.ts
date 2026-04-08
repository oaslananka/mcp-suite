import { MCPClient, StreamableHTTPTransport, StdioTransport } from '@oaslananka/shared';
import type { ServerConfig } from '../dsl/schema.js';
import { spawn } from 'child_process';
import { logger } from '@oaslananka/shared';

export class ConnectionManager {
    private pool: Map<string, MCPClient> = new Map();
    private processes: Map<string, ReturnType<typeof spawn>> = new Map();

    async getClient(serverName: string, config: ServerConfig): Promise<MCPClient> {
        const existingClient = this.pool.get(serverName);
        if (existingClient) {
            return existingClient;
        }

        logger.info(`Creating new connection for server: ${serverName}`);
        
        let client: MCPClient;
        
        if (config.transport === 'http') {
            if (!config.url) {
                throw new Error(`Server ${serverName} is missing URL for HTTP transport`);
            }
            
            const headers: Record<string, string> = {};
            if (config.auth) {
                if (config.auth.type === 'bearer' && config.auth.token) {
                    headers['Authorization'] = `Bearer ${config.auth.token}`;
                } else if (config.auth.type === 'api-key' && config.auth.header && config.auth.value) {
                    headers[config.auth.header] = config.auth.value;
                } else if (config.auth.type === 'basic' && config.auth.username && config.auth.password) {
                    const encoded = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
                    headers['Authorization'] = `Basic ${encoded}`;
                }
            }

            const transport = new StreamableHTTPTransport({
                url: config.url,
                headers
            });
            
            client = new MCPClient(transport, {
                clientInfo: { name: 'mcp-forge', version: '1.0.0' }
            });
            
            await client.connect();

        } else if (config.transport === 'stdio') {
             if (!config.command) {
                throw new Error(`Server ${serverName} is missing command for STDIO transport`);
            }
            
            const [cmd, ...args] = config.command.split(' ');
            if (!cmd) {
                throw new Error(`Server ${serverName} command could not be parsed`);
            }
            
            // Env vars substitution could happen here if we pass ctx or resolve earlier
            const childProcess = spawn(cmd, args, {
                 env: { ...process.env } // Pass current env
            });
            
            childProcess.on('error', (err) => {
                 logger.error({ err, serverName }, "Stdio process error");
            });

            this.processes.set(serverName, childProcess);

            const transport = new StdioTransport(childProcess.stdout, childProcess.stdin);
            client = new MCPClient(transport, {
                clientInfo: { name: 'mcp-forge', version: '1.0.0' }
            });
            
            await client.connect();
        } else {
             throw new Error(`Unknown transport ${config.transport}`);
        }

        this.pool.set(serverName, client);
        return client;
    }

    async releaseClient(_serverName: string, _client: MCPClient): Promise<void> {
        // Pool implementation: do nothing for now, keep connection alive until shutdown
    }

    async shutdown(): Promise<void> {
        logger.info("Shutting down all server connections");
        for (const [name, client] of this.pool.entries()) {
             try {
                 await client.disconnect();
                 logger.info(`Disconnected from server ${name}`);
             } catch (e) {
                 logger.error({ err: e, name }, "Error disconnecting client");
             }
        }
        
        for (const [name, proc] of this.processes.entries()) {
             try {
                 proc.kill();
                 logger.info(`Killed process for server ${name}`);
             } catch(e) {
                 logger.error({ err: e, name }, "Error killing process");
             }
        }

        this.pool.clear();
        this.processes.clear();
    }
}
