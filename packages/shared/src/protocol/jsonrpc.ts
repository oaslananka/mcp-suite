export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

function isJSONObject(message: unknown): message is Record<string, unknown> {
  return typeof message === "object" && message !== null;
}

export function isJSONRPCRequest(message: unknown): message is JSONRPCRequest {
  return isJSONObject(message) && message["jsonrpc"] === "2.0" && "method" in message && "id" in message;
}

export function isJSONRPCResponse(message: unknown): message is JSONRPCResponse {
  return isJSONObject(message) && message["jsonrpc"] === "2.0" && "id" in message && ("result" in message || "error" in message);
}

export function isJSONRPCNotification(message: unknown): message is JSONRPCNotification {
  return isJSONObject(message) && message["jsonrpc"] === "2.0" && "method" in message && !("id" in message);
}
