import { JSONRPCMessage } from "../protocol/jsonrpc.js";
import { EventEmitter } from "events";

export interface Transport extends EventEmitter {
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;

  // Events emitted by EventEmitter
  // on(event: "message", listener: (message: JSONRPCMessage) => void): this;
  // on(event: "close", listener: () => void): this;
  // on(event: "error", listener: (error: Error) => void): this;
}
