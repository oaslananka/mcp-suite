import { Transport } from "../transport/transport.js";
import { EventEmitter } from "events";
import { JSONRPCMessage } from "../protocol/jsonrpc.js";

export class MockTransport extends EventEmitter implements Transport {
    public isStarted = false;
    public sentMessages: JSONRPCMessage[] = [];
    public otherEnd?: MockTransport;

    constructor() {
        super();
    }

    public link(other: MockTransport): void {
        this.otherEnd = other;
        other.otherEnd = this;
    }

    public async start(): Promise<void> {
        this.isStarted = true;
    }

    public async close(): Promise<void> {
        this.isStarted = false;
        this.emit("close");
        if (this.otherEnd && this.otherEnd.isStarted) {
            this.otherEnd.close();
        }
    }

    public async send(message: JSONRPCMessage): Promise<void> {
        if (!this.isStarted) {
            throw new Error("Transport not started");
        }
        this.sentMessages.push(message);

        if (this.otherEnd) {
            // Simulate asynchronous delivery
            setTimeout(() => {
                if (this.otherEnd?.isStarted) {
                    this.otherEnd.emit("message", message);
                }
            }, 0);
        }
    }

    public simulateMessage(message: JSONRPCMessage): void {
        this.emit("message", message);
    }
}
