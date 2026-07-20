import { readFile } from "node:fs/promises";
import { safeFetchText, type SafeFetchResult } from "@oaslananka/shared";
import yaml from "js-yaml";

export const OPENAPI_REMOTE_CONTENT_TYPES = [
  "application/json",
  "application/yaml",
  "application/x-yaml",
  "text/yaml",
  "text/x-yaml",
  "text/plain",
  "application/vnd.oai.openapi+json",
  "application/vnd.oai.openapi+yaml",
] as const;

export interface OpenAPIRemoteOptions {
  maxRedirects?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  trustedPrivateHosts?: string[];
}

export interface OpenAPIParserOptions {
  remote?: OpenAPIRemoteOptions;
}

export type OpenAPIRemoteLoader = typeof safeFetchText;

export interface ParsedEndpoint {
  method: string;
  path: string;
  operationId: string;
  description?: string;
  params?: unknown[];
  body?: unknown;
  response?: unknown;
}

export interface ParsedAPI {
  endpoints: ParsedEndpoint[];
  servers: string[];
  securitySchemes: Record<string, unknown>;
}

export class OpenAPIParser {
  constructor(
    private readonly options: OpenAPIParserOptions = {},
    private readonly remoteLoader: OpenAPIRemoteLoader = safeFetchText
  ) {}

  async parseFile(filePath: string): Promise<ParsedAPI> {
    const raw = await readFile(filePath, "utf8");
    return this.parseYAML(raw);
  }

  async parseURL(url: string): Promise<ParsedAPI> {
    const remote = this.options.remote ?? {};
    const response: SafeFetchResult = await this.remoteLoader(url, {
      label: "Remote OpenAPI schema policy",
      allowedContentTypes: [...OPENAPI_REMOTE_CONTENT_TYPES],
      maxRedirects: remote.maxRedirects ?? 3,
      maxResponseBytes: remote.maxResponseBytes ?? 1_000_000,
      timeoutMs: remote.timeoutMs ?? 10_000,
      ...(remote.trustedPrivateHosts ? { trustedPrivateHosts: remote.trustedPrivateHosts } : {}),
    });
    if (!response.ok) {
      throw new Error(`Remote OpenAPI schema request failed with HTTP ${response.status}`);
    }

    return this.parseYAML(response.bodyText);
  }

  async parseYAML(content: string): Promise<ParsedAPI> {
    const document = yaml.load(content) as Record<string, unknown>;
    const paths = this.readPaths(document["paths"]);
    const endpoints: ParsedEndpoint[] = [];

    for (const [routePath, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods ?? {})) {
        const endpoint: ParsedEndpoint = {
          method: method.toUpperCase(),
          path: routePath,
          operationId: operation.operationId ?? `${method}_${routePath.replace(/[^\w]/g, "_")}`,
          ...((operation.description ?? operation.summary)
            ? { description: operation.description ?? operation.summary }
            : {}),
          ...(operation.parameters ? { params: operation.parameters } : {}),
          ...(operation.requestBody ? { body: operation.requestBody } : {}),
          ...(operation.responses ? { response: operation.responses } : {}),
        };
        endpoints.push({
          ...endpoint,
        });
      }
    }

    return {
      endpoints,
      servers: this.readServers(document["servers"]),
      securitySchemes: this.readSecuritySchemes(document["components"]),
    };
  }

  private readPaths(value: unknown): Record<string, Record<string, ParsedOperation>> {
    if (!value || typeof value !== "object") {
      return {};
    }

    return value as Record<string, Record<string, ParsedOperation>>;
  }

  private readServers(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((server) =>
        server && typeof server === "object" && "url" in server && typeof server.url === "string"
          ? server.url
          : undefined
      )
      .filter((url): url is string => Boolean(url));
  }

  private readSecuritySchemes(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || !("securitySchemes" in value)) {
      return {};
    }

    const securitySchemes = value.securitySchemes;
    if (!securitySchemes || typeof securitySchemes !== "object") {
      return {};
    }

    return securitySchemes as Record<string, unknown>;
  }
}

interface ParsedOperation {
  operationId?: string;
  description?: string;
  summary?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: unknown;
}
