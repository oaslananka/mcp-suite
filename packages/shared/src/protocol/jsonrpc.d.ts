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
export declare function isJSONRPCRequest(message: unknown): message is JSONRPCRequest;
export declare function isJSONRPCResponse(message: unknown): message is JSONRPCResponse;
export declare function isJSONRPCNotification(message: unknown): message is JSONRPCNotification;
//# sourceMappingURL=jsonrpc.d.ts.map