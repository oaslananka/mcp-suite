import { Transport } from "../transport/transport.js";
import { EventEmitter } from "events";
import { JSONRPCMessage } from "../protocol/jsonrpc.js";
export declare class MockTransport extends EventEmitter implements Transport {
    isStarted: boolean;
    sentMessages: JSONRPCMessage[];
    otherEnd?: MockTransport;
    constructor();
    link(other: MockTransport): void;
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: JSONRPCMessage): Promise<void>;
    simulateMessage(message: JSONRPCMessage): void;
}
//# sourceMappingURL=MockTransport.d.ts.map