export interface ToolSummary {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface ResourceSummary {
  uri: string;
  name?: string;
  description?: string;
}

export interface PromptSummary {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string }>;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  type: "stdio" | "http";
  endpoint: string;
  command: string | undefined;
  args: string[];
  favorite: boolean;
  createdAt: string;
}

export interface ToolHistoryRecord {
  id: number;
  connectionId: string;
  toolName: string;
  input: string;
  output: string;
  latencyMs: number;
  isError: boolean;
  createdAt: string;
}

export interface ServerInfoPayload {
  connected: boolean;
  connection: ConnectionRecord | undefined;
  capabilities: Record<string, unknown> | undefined;
  serverInfo: Record<string, unknown> | undefined;
}

export interface ConnectServerOptions {
  type: "stdio" | "http";
  name: string | undefined;
  url: string | undefined;
  command: string | undefined;
  args: string[] | undefined;
}

export interface ConnectServerResult {
  success: boolean;
  error: string | undefined;
  connection: ConnectionRecord | undefined;
  capabilities: Record<string, unknown> | undefined;
  serverInfo: Record<string, unknown> | undefined;
}

export interface ToolCallResponse {
  result: unknown;
  latency: number;
}

export interface LabApi {
  connectServer: (opts: ConnectServerOptions) => Promise<ConnectServerResult>;
  disconnectServer: () => Promise<{ success: boolean }>;
  getServerInfo: () => Promise<ServerInfoPayload>;
  listConnections: () => Promise<ConnectionRecord[]>;
  deleteConnection: (id: string) => Promise<{ success: boolean }>;
  deleteAllConnections: () => Promise<{ success: boolean; deleted: number }>;
  setFavoriteConnection: (id: string, favorite: boolean) => Promise<ConnectionRecord | null>;
  listTools: () => Promise<{ tools: ToolSummary[] }>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResponse>;
  listResources: () => Promise<{ resources: ResourceSummary[] }>;
  readResource: (uri: string) => Promise<unknown>;
  subscribeResource: (uri: string) => Promise<unknown>;
  listPrompts: () => Promise<{ prompts: PromptSummary[] }>;
  getPrompt: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  listHistory: () => Promise<ToolHistoryRecord[]>;
  listCollections: () => Promise<string[]>;
  startMock: (config: unknown) => Promise<unknown>;
  stopMock: () => Promise<unknown>;
  getSettings: () => Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    labApi?: LabApi;
  }
}
