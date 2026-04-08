/**
 * Model Context Protocol (MCP) Types 2025-11-05 Spec
 * https://spec.modelcontextprotocol.io/
 */

export type JSONSchemaType =
  | "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

/**
 * A standard JSON Schema object.
 */
export interface JSONSchema7 {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  items?: JSONSchema7 | JSONSchema7[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  allOf?: JSONSchema7[];
  not?: JSONSchema7;
  $ref?: string;
  definitions?: Record<string, JSONSchema7>;
  $defs?: Record<string, JSONSchema7>;
  [key: string]: unknown;
}

/**
 * Definition for an MCP Tool.
 */
export interface Tool {
  /** The unique name of the tool. */
  name: string;
  /** A human-readable description of what the tool does. */
  description: string;
  /** JSON Schema defining the input parameters for the tool. */
  inputSchema: JSONSchema7;
  /** Optional annotations to provide hints about tool behavior. */
  annotations?: {
    /** If true, the tool only reads data and does not modify state. */
    readOnly?: boolean;
    /** If true, the tool modifies state and may be dangerous. */
    destructive?: boolean;
    /** If true, calling the tool multiple times has the same effect as calling it once. */
    idempotent?: boolean;
    /** If true, the tool operates on an open-world assumption. */
    openWorld?: boolean;
  };
}

/**
 * Definition for an MCP Resource.
 */
export interface Resource {
  /** Unique URI identifying the resource. */
  uri: string;
  /** Human-readable name of the resource. */
  name: string;
  /** Optional description of the resource. */
  description?: string;
  /** Optional MIME type of the resource's content. */
  mimeType?: string;
}

export interface ResourceTemplate {
    uriTemplate: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface ResourceContents {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
}

/**
 * Argument for a Prompt.
 */
export interface PromptArgument {
  /** The name of the argument. */
  name: string;
  /** Description of the argument. */
  description?: string;
  /** Whether the argument is required. */
  required?: boolean;
}

/**
 * Definition for an MCP Prompt.
 */
export interface Prompt {
  /** The name of the prompt. */
  name: string;
  /** Optional description of the prompt. */
  description?: string;
  /** Optional arguments that the prompt accepts. */
  arguments?: PromptArgument[];
}

export interface PromptMessage {
    role: "user" | "assistant";
    content: ContentBlock;
}

/**
 * Content block within an MCP message or result.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: ResourceContents };

/**
 * Result of executing an MCP Tool.
 */
export interface ToolCallResult {
  /** The content returned by the tool. */
  content: ContentBlock[];
  /** Whether the tool execution resulted in an error. */
  isError?: boolean;
  /** Optional structured output for tools returning specific data structures (2025-06-18 spec). */
  structuredOutput?: unknown;
}

export interface TaskError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Async Task status definition (2025-11-05 spec).
 */
export interface Task {
  /** Unique identifier for the task. */
  id: string;
  /** Current status of the task. */
  status: "queued" | "running" | "succeeded" | "failed";
  /** Optional progress indicator (0.0 to 1.0 or percentage). */
  progress?: number;
  /** The result of the task if it succeeded. */
  result?: ToolCallResult;
  /** The error if the task failed. */
  error?: TaskError;
  /** Timestamp when the task was created. */
  createdAt: string;
  /** Timestamp when the task was last updated. */
  updatedAt: string;
}

export interface Pagination {
    cursor?: string;
}

export interface PaginatedResult<T> {
    items: T[];
    nextCursor?: string;
}
