import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import fetch, { type RequestInit, type Response } from "node-fetch";
import {
  resolvePublicHttpUrl,
  UrlPolicyError,
  type DnsAddress,
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

export async function safeFetchText(
  input: string | URL,
  options: SafeFetchOptions = {},
  runtime: SafeFetchRuntime = {}
): Promise<SafeFetchResult> {
  const label = options.label ?? "Safe HTTP fetch";
  const maxRedirects = assertNonNegativeInteger(
    options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    "maxRedirects"
  );
  const timeoutMs = assertPositiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const maxRequestBytes = assertPositiveInteger(
    options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
    "maxRequestBytes"
  );
  const maxResponseBytes = assertPositiveInteger(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes"
  );
  let requestBody = options.body;
  let requestMethod = (options.method ?? "GET").toUpperCase();
  if (requestBody !== undefined && byteLength(requestBody) > maxRequestBytes) {
    throw new SafeFetchError(`${label}: request body exceeds the maximum allowed size`);
  }

  const fetchImpl = runtime.fetch ?? fetch;
  let target = await resolveFetchTarget(input, options, label);
  let requestHeaders = withoutHostHeader(options.headers ?? {});

  for (let redirectCount = 0; ; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new SafeFetchError(`${label}: request timed out`)),
      timeoutMs
    );

    try {
      const requestInit: RequestInit = {
        method: requestMethod,
        headers: requestHeaders,
        redirect: "manual",
        signal: controller.signal,
        agent: createPinnedAgent(target.url, selectPinnedAddresses(target, label)),
      };
      if (requestBody !== undefined) {
        requestInit.body = typeof requestBody === "string" ? requestBody : Buffer.from(requestBody);
      }
      const response = await fetchImpl(target.url.toString(), requestInit);

      if (isRedirect(response.status)) {
        destroyResponseBody(response);
        if (redirectCount >= maxRedirects) {
          throw new SafeFetchError(`${label}: too many redirects`);
        }

        const location = response.headers.get("location");
        if (!location) {
          throw new SafeFetchError(`${label}: redirect response is missing a location header`);
        }

        const nextUrl = new URL(location, target.url);
        const crossOrigin = nextUrl.origin !== target.url.origin;
        if (crossOrigin) {
          requestHeaders = withoutCrossOriginCredentials(requestHeaders);
          if (requestBody !== undefined && (response.status === 307 || response.status === 308)) {
            throw new SafeFetchError(
              `${label}: cross-origin redirect cannot forward a request body`
            );
          }
        }

        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && requestMethod === "POST")
        ) {
          requestMethod = "GET";
          requestBody = undefined;
          requestHeaders = withoutEntityHeaders(requestHeaders);
        }

        target = await resolveFetchTarget(nextUrl, options, `${label} redirect`);
        continue;
      }

      assertAllowedContentType(response, options.allowedContentTypes, label);
      const bodyText = await readLimitedResponseBody(
        response,
        maxResponseBytes,
        controller.signal,
        label
      );
      return {
        bodyText,
        finalUrl: target.url,
        headers: response.headers,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        throw new SafeFetchError(`${label}: request timed out`);
      }
      if (error instanceof UrlPolicyError || error instanceof SafeFetchError) {
        throw error;
      }
      throw new SafeFetchError(`${label}: request failed`);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function resolveFetchTarget(
  input: string | URL,
  options: SafeFetchOptions,
  label: string
): Promise<Awaited<ReturnType<typeof resolvePublicHttpUrl>>> {
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

function selectPinnedAddresses(
  target: Awaited<ReturnType<typeof resolvePublicHttpUrl>>,
  label: string
): DnsAddress[] {
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
