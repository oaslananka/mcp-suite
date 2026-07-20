import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import fetch, { type RequestInit, type Response } from "node-fetch";
import {
  resolvePublicHttpUrl,
  UrlPolicyError,
  type DnsAddress,
  type PublicHttpUrlResolution,
  type UrlPolicyOptions,
} from "./urlPolicy.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_REQUEST_BYTES = 1_000_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const CROSS_ORIGIN_SENSITIVE_HEADERS = new Set([
  "api-key",
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
]);
const CROSS_ORIGIN_SENSITIVE_HEADER_SUFFIX =
  /(?:^|[-_])(credential|credentials|password|secret|token)$/;

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

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

interface ResolvedSafeFetchOptions {
  allowedContentTypes?: string[];
  fetchImpl: typeof fetch;
  label: string;
  maxRedirects: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  policy: SafeFetchOptions;
  timeoutMs: number;
}

interface SafeFetchRequestState {
  body?: string | Uint8Array;
  headers: Record<string, string>;
  method: string;
}

type SafeFetchHopResult =
  | { kind: "complete"; result: SafeFetchResult }
  | { kind: "redirect"; target: PublicHttpUrlResolution };

export async function safeFetchText(
  input: string | URL,
  options: SafeFetchOptions = {},
  runtime: SafeFetchRuntime = {}
): Promise<SafeFetchResult> {
  const resolved = resolveSafeFetchOptions(options, runtime);
  const request = createRequestState(options, resolved);
  let target = await resolveFetchTarget(input, resolved.policy, resolved.label);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const hop = await executeRequestHop(target, request, resolved, redirectCount);
    if (hop.kind === "complete") {
      return hop.result;
    }
    target = hop.target;
  }
}

function resolveSafeFetchOptions(
  options: SafeFetchOptions,
  runtime: SafeFetchRuntime
): ResolvedSafeFetchOptions {
  return {
    ...(options.allowedContentTypes ? { allowedContentTypes: options.allowedContentTypes } : {}),
    fetchImpl: runtime.fetch ?? fetch,
    label: options.label ?? "Safe HTTP fetch",
    maxRedirects: assertNonNegativeInteger(
      options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      "maxRedirects"
    ),
    maxRequestBytes: assertPositiveInteger(
      options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
      "maxRequestBytes"
    ),
    maxResponseBytes: assertPositiveInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "maxResponseBytes"
    ),
    policy: options,
    timeoutMs: assertPositiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs"),
  };
}

function createRequestState(
  options: SafeFetchOptions,
  resolved: ResolvedSafeFetchOptions
): SafeFetchRequestState {
  const body = options.body;
  if (body !== undefined && byteLength(body) > resolved.maxRequestBytes) {
    throw new SafeFetchError(`${resolved.label}: request body exceeds the maximum allowed size`);
  }

  return {
    ...(body !== undefined ? { body } : {}),
    headers: withoutHostHeader(options.headers ?? {}),
    method: (options.method ?? "GET").toUpperCase(),
  };
}

async function executeRequestHop(
  target: PublicHttpUrlResolution,
  request: SafeFetchRequestState,
  options: ResolvedSafeFetchOptions,
  redirectCount: number
): Promise<SafeFetchHopResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new SafeFetchError(`${options.label}: request timed out`)),
    options.timeoutMs
  );

  try {
    const response = await options.fetchImpl(
      target.url.toString(),
      createRequestInit(target, request, controller.signal, options.label)
    );

    if (isRedirect(response.status)) {
      const nextTarget = await followRedirect(response, target, request, options, redirectCount);
      return { kind: "redirect", target: nextTarget };
    }

    assertAllowedContentType(response, options.allowedContentTypes, options.label);
    return {
      kind: "complete",
      result: {
        bodyText: await readLimitedResponseBody(
          response,
          options.maxResponseBytes,
          controller.signal,
          options.label
        ),
        finalUrl: target.url,
        headers: response.headers,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      },
    };
  } catch (error: unknown) {
    throw normalizeFetchFailure(error, controller.signal, options.label);
  } finally {
    clearTimeout(timer);
  }
}

function createRequestInit(
  target: PublicHttpUrlResolution,
  request: SafeFetchRequestState,
  signal: AbortSignal,
  label: string
): RequestInit {
  const requestInit: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
    signal,
    agent: createPinnedAgent(target.url, selectPinnedAddresses(target, label)),
  };
  if (request.body !== undefined) {
    requestInit.body = typeof request.body === "string" ? request.body : Buffer.from(request.body);
  }
  return requestInit;
}

async function followRedirect(
  response: Response,
  currentTarget: PublicHttpUrlResolution,
  request: SafeFetchRequestState,
  options: ResolvedSafeFetchOptions,
  redirectCount: number
): Promise<PublicHttpUrlResolution> {
  destroyResponseBody(response);
  if (redirectCount >= options.maxRedirects) {
    throw new SafeFetchError(`${options.label}: too many redirects`);
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new SafeFetchError(`${options.label}: redirect response is missing a location header`);
  }

  const nextUrl = new URL(location, currentTarget.url);
  applyRedirectRequestPolicy(
    request,
    response.status,
    nextUrl.origin !== currentTarget.url.origin,
    options.label
  );
  return resolveFetchTarget(nextUrl, options.policy, `${options.label} redirect`);
}

function applyRedirectRequestPolicy(
  request: SafeFetchRequestState,
  status: number,
  crossOrigin: boolean,
  label: string
): void {
  if (crossOrigin) {
    request.headers = withoutCrossOriginCredentials(request.headers);
    if (request.body !== undefined && preservesMethodAndBody(status)) {
      throw new SafeFetchError(`${label}: cross-origin redirect cannot forward a request body`);
    }
  }

  if (rewritesToGet(status, request.method)) {
    request.method = "GET";
    delete request.body;
    request.headers = withoutEntityHeaders(request.headers);
  }
}

function preservesMethodAndBody(status: number): boolean {
  return status === 307 || status === 308;
}

function rewritesToGet(status: number, method: string): boolean {
  return status === 303 || ((status === 301 || status === 302) && method === "POST");
}

function normalizeFetchFailure(error: unknown, signal: AbortSignal, label: string): Error {
  if (signal.aborted) {
    return new SafeFetchError(`${label}: request timed out`);
  }
  if (error instanceof UrlPolicyError || error instanceof SafeFetchError) {
    return error;
  }
  return new SafeFetchError(`${label}: request failed`);
}

async function resolveFetchTarget(
  input: string | URL,
  options: SafeFetchOptions,
  label: string
): Promise<PublicHttpUrlResolution> {
  const target = await resolvePublicHttpUrl(input, {
    ...(options.allowedHosts ? { allowedHosts: options.allowedHosts } : {}),
    ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.requireHttps !== undefined ? { requireHttps: options.requireHttps } : {}),
    ...(options.trustedPrivateHosts ? { trustedPrivateHosts: options.trustedPrivateHosts } : {}),
    label,
  });
  if (target.addresses.length === 0) {
    throw new SafeFetchError(`${label}: DNS resolution and address pinning are required`);
  }
  return target;
}

function selectPinnedAddresses(target: PublicHttpUrlResolution, label: string): DnsAddress[] {
  if (target.addresses.length === 0) {
    throw new SafeFetchError(`${label}: target host did not resolve`);
  }
  return target.addresses;
}

function createPinnedAgent(url: URL, addresses: DnsAddress[]): HttpAgent | HttpsAgent {
  const lookup = ((
    _hostname: string,
    lookupOptions: { all?: boolean },
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | DnsAddress[],
      family?: number
    ) => void
  ): void => {
    if (lookupOptions.all) {
      callback(null, addresses);
      return;
    }
    const address = addresses[0];
    if (!address) {
      callback(new Error("Pinned DNS address is unavailable"), "");
      return;
    }
    callback(null, address.address, address.family);
  }) as never;

  return url.protocol === "http:" ? new HttpAgent({ lookup }) : new HttpsAgent({ lookup });
}

function withoutHostHeader(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "host")
  );
}

function withoutEntityHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !["content-length", "content-type", "transfer-encoding"].includes(name.toLowerCase())
    )
  );
}

function withoutCrossOriginCredentials(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        !CROSS_ORIGIN_SENSITIVE_HEADERS.has(normalized) &&
        !CROSS_ORIGIN_SENSITIVE_HEADER_SUFFIX.test(normalized)
      );
    })
  );
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function assertAllowedContentType(
  response: Response,
  allowedContentTypes: string[] | undefined,
  label: string
): void {
  if (!allowedContentTypes || allowedContentTypes.length === 0) {
    return;
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const allowed = new Set(allowedContentTypes.map((value) => value.trim().toLowerCase()));
  if (!contentType || !allowed.has(contentType)) {
    destroyResponseBody(response);
    throw new SafeFetchError(`${label}: response content type is not allowed`);
  }
}

async function readLimitedResponseBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  label: string
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    destroyResponseBody(response);
    throw new SafeFetchError(`${label}: response body exceeds the maximum allowed size`);
  }
  if (!response.body) {
    return "";
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const body = response.body as AsyncIterable<Buffer | Uint8Array | string> & {
    destroy?: () => void;
  };
  const iterator = body[Symbol.asyncIterator]();
  try {
    while (true) {
      const next = await nextChunk(iterator, signal, label);
      if (next.done) {
        break;
      }
      const buffer = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        throw new SafeFetchError(`${label}: response body exceeds the maximum allowed size`);
      }
      chunks.push(buffer);
    }
  } catch (error: unknown) {
    destroyResponseBody(response);
    throw error;
  } finally {
    void Promise.resolve(iterator.return?.()).catch(() => undefined);
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

async function nextChunk<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
  label: string
): Promise<IteratorResult<T>> {
  if (signal.aborted) {
    throw new SafeFetchError(`${label}: request timed out`);
  }

  return new Promise<IteratorResult<T>>((resolve, reject) => {
    const onAbort = (): void => reject(new SafeFetchError(`${label}: request timed out`));
    signal.addEventListener("abort", onAbort, { once: true });
    void iterator.next().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function destroyResponseBody(response: Response): void {
  const body = response.body as { destroy?: () => void } | null;
  body?.destroy?.();
}

function byteLength(value: string | Uint8Array): number {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : value.byteLength;
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SafeFetchError(`${label} must be a positive integer`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SafeFetchError(`${label} must be a non-negative integer`);
  }
  return value;
}
