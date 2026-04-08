import { ContentBlock } from "./types.js";

export interface ClientCapabilities {
    experimental?: Record<string, unknown>;
    roots?: {
        listChanged?: boolean;
    };
    sampling?: Record<string, unknown>;
}

export interface ServerCapabilities {
    experimental?: Record<string, unknown>;
    prompts?: {
        listChanged?: boolean;
    };
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    tools?: {
        listChanged?: boolean;
    };
    logging?: Record<string, unknown>;
}

export interface Implementation {
    name: string;
    version: string;
}

export interface InitializeRequestParams {
    protocolVersion: string;
    capabilities: ClientCapabilities;
    clientInfo: Implementation;
}

export interface InitializeResult {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: Implementation;
    instructions?: string;
}

export interface SamplingMessage {
  role: "user" | "assistant";
  content: ContentBlock;
}

export interface SamplingCreateMessageParams {
  messages: SamplingMessage[];
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  systemPrompt?: string;
  includeContext?: "none" | "thisServer" | "allServers";
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

export interface SamplingResult {
  role: "assistant";
  content: ContentBlock;
  model: string;
  stopReason?: "endTurn" | "stopSequence" | "maxTokens";
}
