import { EventEmitter } from "events";
import { Transport } from "./transport.js";
import { JSONRPCMessage } from "../protocol/jsonrpc.js";
export declare class StdioTransport extends EventEmitter implements Transport {
    private readonly inStream;
    private readonly outStream;
    private rl?;
    constructor(inStream?: NodeJS.ReadableStream, outStream?: NodeJS.WritableStream);
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: JSONRPCMessage): Promise<void>;
}
//# sourceMappingURL=stdio.d.ts.map