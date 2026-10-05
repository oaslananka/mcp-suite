export declare const ErrorCodes: {
    readonly ParseError: -32700;
    readonly InvalidRequest: -32600;
    readonly MethodNotFound: -32601;
    readonly InvalidParams: -32602;
    readonly InternalError: -32603;
    readonly Unauthorized: -32001;
    readonly ResourceNotFound: -32002;
    readonly ToolNotFound: -32003;
    readonly PromptNotFound: -32004;
    readonly TaskNotFound: -32005;
};
export declare class MCPError extends Error {
    code: number;
    data?: unknown;
    constructor(code: number, message: string, data?: unknown);
    static parseError(message?: string): MCPError;
    static invalidRequest(message?: string): MCPError;
    static methodNotFound(method: string): MCPError;
    static invalidParams(message?: string): MCPError;
    static internalError(message?: string): MCPError;
}
//# sourceMappingURL=errors.d.ts.map