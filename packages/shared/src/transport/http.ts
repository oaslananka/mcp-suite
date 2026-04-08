import { EventEmitter } from "events";
import { Transport } from "./transport.js";
import { JSONRPCMessage } from "../protocol/jsonrpc.js";
import { v4 as uuidv4 } from "uuid";
import { LATEST_PROTOCOL_VERSION } from "../protocol/version.js";

export interface HTTPTransportOptions {
  url: string;
  headers?: Record<string, string>;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  reconnectBackoffFactor?: number;
}

/**
 * Basic StreamableHTTPTransport using EventSource (SSE) for server->client
 * and POST requests for client->server.
 */
export class StreamableHTTPTransport extends EventEmitter implements Transport {
  private readonly url: string;
  private headers: Record<string, string>;
  private readonly sessionId: string;
  private abortController?: AbortController;
  private reconnectOpts: {
    enabled: boolean;
    maxAttempts: number;
    delayMs: number;
    backoffFactor: number;
  };
  private reconnectAttempts = 0;
  private isClosing = false;
  private protocolVersion = LATEST_PROTOCOL_VERSION;

  constructor(options: HTTPTransportOptions) {
    super();
    this.url = options.url;
    this.headers = options.headers || {};
    this.sessionId = uuidv4();
    this.reconnectOpts = {
      enabled: options.reconnect !== false,
      maxAttempts: options.maxReconnectAttempts || 5,
      delayMs: options.reconnectDelayMs || 1000,
      backoffFactor: options.reconnectBackoffFactor || 2,
    };
  }

  public setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }

  public setReconnectPolicy(policy: {
    enabled: boolean;
    maxAttempts: number;
    delayMs: number;
    backoffFactor: number;
  }): void {
    this.reconnectOpts = {
      enabled: policy.enabled,
      maxAttempts: policy.maxAttempts,
      delayMs: policy.delayMs,
      backoffFactor: policy.backoffFactor,
    };
  }

  async start(): Promise<void> {
    this.isClosing = false;
    this.reconnectAttempts = 0;
    await this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    while (true) {
        try {
            await this.connect();
            break; // Success
        } catch (e: unknown) {
            if (this.isClosing) return;
            
            this.reconnectAttempts++;
            if (!this.reconnectOpts.enabled || this.reconnectAttempts >= this.reconnectOpts.maxAttempts) {
                this.emit("error", e);
                this.emit("close");
                return;
            }
            
            // Exponential backoff
            const delay = Math.min(
              this.reconnectOpts.delayMs * Math.pow(this.reconnectOpts.backoffFactor, this.reconnectAttempts - 1),
              30000,
            );
            await new Promise(r => setTimeout(r, delay));
        }
    }
  }

  private async connect(): Promise<void> {
    this.abortController = new AbortController();
    
    const headers: Record<string, string> = {
        ...this.headers,
        'Accept': 'text/event-stream',
        'MCP-Protocol-Version': this.protocolVersion,
        'X-MCP-Session-ID': this.sessionId
    };

    const response = await fetch(this.url + '/sse', {
        headers,
        signal: this.abortController.signal
    });

    if (!response.ok || !response.body) {
         throw new Error(`Failed to connect to SSE: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Run background loop
    (async () => {
         try {
             while (true) {
                 const { done, value } = await reader.read();
                 if (done) break;
                 buffer += decoder.decode(value, { stream: true });
                 
                 const lines = buffer.split('\n');
                 buffer = lines.pop() || ''; // Keep the incomplete line
                 
                 for (const line of lines) {
                     if (line.startsWith('data: ')) {
                         const data = line.slice(6);
                         if (data) {
                             try {
                                 const message = JSON.parse(data) as JSONRPCMessage;
                                 this.emit("message", message);
                             } catch (_e) {
                                 this.emit("error", new Error(`Parse error in SSE: ${data}`));
                             }
                         }
                     }
                 }
             }
         } catch (err: unknown) {
             if (!(err instanceof Error && err.name === 'AbortError') && !this.isClosing) {
                 this.emit("error", err);
                 // If stream died, try to reconnect
                 if (this.reconnectOpts.enabled) {
                     this.connectWithRetry();
                     return;
                 }
             }
         }
         
         if (!this.isClosing && this.reconnectOpts.enabled) {
             this.connectWithRetry();
         } else {
             this.emit("close");
         }
    })();
  }

  async close(): Promise<void> {
    this.isClosing = true;
    if (this.abortController) {
        this.abortController.abort();
    }
    this.emit("close");
  }

  async send(message: JSONRPCMessage): Promise<void> {
      try {
          const res = await fetch(this.url + '/message', {
              method: 'POST',
              headers: {
                  ...this.headers,
                  'Content-Type': 'application/json',
                  'MCP-Protocol-Version': this.protocolVersion,
                  'X-MCP-Session-ID': this.sessionId
              },
              body: JSON.stringify(message)
          });
          if (!res.ok) {
              throw new Error(`Failed to send HTTP message: ${res.statusText}`);
          }
      } catch (e: unknown) {
          throw e;
      }
  }
}
