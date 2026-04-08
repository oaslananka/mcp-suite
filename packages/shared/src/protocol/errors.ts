export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  
  // Custom MCP specific codes
  Unauthorized: -32001,
  ResourceNotFound: -32002,
  ToolNotFound: -32003,
  PromptNotFound: -32004,
  TaskNotFound: -32005,
} as const;

export class MCPError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.data = data;
  }

  static parseError(message = "Parse error") {
    return new MCPError(ErrorCodes.ParseError, message);
  }

  static invalidRequest(message = "Invalid Request") {
    return new MCPError(ErrorCodes.InvalidRequest, message);
  }

  static methodNotFound(method: string) {
    return new MCPError(ErrorCodes.MethodNotFound, `Method not found: ${method}`);
  }

  static invalidParams(message = "Invalid params") {
    return new MCPError(ErrorCodes.InvalidParams, message);
  }

  static internalError(message = "Internal error") {
    return new MCPError(ErrorCodes.InternalError, message);
  }
}
