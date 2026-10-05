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
export declare class ApiKeyMiddleware {
    private readonly validator;
    private readonly headerName;
    private readonly scheme;
    constructor(validator: ApiKeyValidator, options?: ApiKeyMiddlewareOptions);
    extractKey(headers: HeaderMap): string | null;
    authorize(headers: HeaderMap): Promise<ApiKeyPrincipal>;
    ensureScope(headers: HeaderMap, requiredScope: string): Promise<ApiKeyPrincipal>;
}
//# sourceMappingURL=ApiKeyMiddleware.d.ts.map