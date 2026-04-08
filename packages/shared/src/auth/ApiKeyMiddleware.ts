import { MCPError, ErrorCodes } from "../protocol/errors.js";

export interface ApiKeyPrincipal {
    id: string;
    scopes?: string[];
    metadata?: Record<string, unknown>;
}

export type HeaderValue = string | string[] | undefined;
export type HeaderMap = Record<string, HeaderValue>;
export type ApiKeyValidator = (apiKey: string) => Promise<ApiKeyPrincipal | null> | ApiKeyPrincipal | null;

export interface ApiKeyMiddlewareOptions {
    headerName?: string;
    scheme?: string;
}

export class ApiKeyMiddleware {
    private readonly headerName: string;
    private readonly scheme: string;

    constructor(private readonly validator: ApiKeyValidator, options: ApiKeyMiddlewareOptions = {}) {
        this.headerName = (options.headerName ?? "authorization").toLowerCase();
        this.scheme = options.scheme ?? "Bearer";
    }

    extractKey(headers: HeaderMap): string | null {
        const rawHeader = headers[this.headerName] ?? headers[this.headerName.toLowerCase()];
        const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
        if (!headerValue) {
            return null;
        }

        const expectedPrefix = `${this.scheme} `;
        if (!headerValue.startsWith(expectedPrefix)) {
            return null;
        }

        const token = headerValue.slice(expectedPrefix.length).trim();
        return token.length > 0 ? token : null;
    }

    async authorize(headers: HeaderMap): Promise<ApiKeyPrincipal> {
        const token = this.extractKey(headers);
        if (!token) {
            throw new MCPError(ErrorCodes.Unauthorized, "Missing or invalid API key");
        }

        const principal = await this.validator(token);
        if (!principal) {
            throw new MCPError(ErrorCodes.Unauthorized, "Invalid API key");
        }

        return principal;
    }

    async ensureScope(headers: HeaderMap, requiredScope: string): Promise<ApiKeyPrincipal> {
        const principal = await this.authorize(headers);
        const scopes = principal.scopes ?? [];
        if (!scopes.includes(requiredScope)) {
            throw new MCPError(ErrorCodes.Unauthorized, `Missing required scope: ${requiredScope}`);
        }

        return principal;
    }
}
