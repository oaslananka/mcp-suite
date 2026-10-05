import fetch, { type Response } from "node-fetch";
import { type UrlPolicyOptions } from "./urlPolicy.js";
export interface SafeFetchOptions extends UrlPolicyOptions {
    allowedContentTypes?: string[];
    body?: string | Uint8Array;
    headers?: Record<string, string>;
    maxRedirects?: number;
    maxRequestBytes?: number;
    maxResponseBytes?: number;
    method?: string;
    timeoutMs?: number;
}
export interface SafeFetchResult {
    bodyText: string;
    finalUrl: URL;
    headers: Response["headers"];
    ok: boolean;
    status: number;
    statusText: string;
}
export interface SafeFetchRuntime {
    fetch?: typeof fetch;
}
export declare class SafeFetchError extends Error {
    constructor(message: string);
}
export declare function safeFetchText(input: string | URL, options?: SafeFetchOptions, runtime?: SafeFetchRuntime): Promise<SafeFetchResult>;
//# sourceMappingURL=safeFetch.d.ts.map