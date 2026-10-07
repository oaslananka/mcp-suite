import { JSONRPCMessage } from "../protocol/jsonrpc.js";
import { EventEmitter } from "events";
export interface Transport extends EventEmitter {
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: JSONRPCMessage): Promise<void>;
}
//# sourceMappingURL=transport.d.ts.map