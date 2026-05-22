import { EventEmitter } from "events";
import { Transport } from "./transport.js";
import { JSONRPCMessage } from "../protocol/jsonrpc.js";
import readline from "readline";

export class StdioTransport extends EventEmitter implements Transport {
  private rl?: readline.Interface;

  constructor(
    private readonly inStream: NodeJS.ReadableStream = process.stdin,
    private readonly outStream: NodeJS.WritableStream = process.stdout
  ) {
    super();
  }

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: this.inStream,
      terminal: false,
    });

    this.rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const message = JSON.parse(line) as JSONRPCMessage;
        this.emit("message", message);
      } catch (_err) {
        this.emit("error", new Error(`Failed to parse JSON: ${line}`));
      }
    });

    this.rl.on("close", () => {
      this.emit("close");
    });
  }

  async close(): Promise<void> {
    if (this.rl) {
      this.rl.close();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(message) + "\n";
      this.outStream.write(payload, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
