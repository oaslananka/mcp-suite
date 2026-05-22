import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { BaseNode } from "./BaseNode.js";
import type { StepConfig } from "../dsl/schema.js";
import type { RunContext } from "../runtime/RunContext.js";
import type { StepResult } from "../engine/Step.js";
import { Transformer } from "../engine/Transformer.js";
import { resolvePublicHttpUrl } from "@oaslananka/shared";
import type { DnsAddress } from "@oaslananka/shared";
import fetch, { type Response } from "node-fetch";

export class HttpNode extends BaseNode {
  private transformer = new Transformer();
  private readonly maxRedirects = 3;
  private readonly timeoutMs = 10_000;
  private readonly maxRequestBytes = 1_000_000;
  private readonly maxResponseBytes = 1_000_000;

  async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
    if (!("url" in step) || !("method" in step)) {
      return { status: "failed", error: "Missing url or method in HTTP node" };
    }

    try {
      const templateContext = ctx.dataBus.toTemplateContext();

      // Resolve URL
      let resolvedUrl = step.url as string;
      if (resolvedUrl.includes("{{")) {
        resolvedUrl = this.transformer.transform(resolvedUrl, templateContext) as string;
      }

      // Resolve Headers
      const resolvedHeaders: Record<string, string> = {};
      if (step.headers) {
        for (const [key, value] of Object.entries(step.headers as Record<string, string>)) {
          if (value.includes("{{")) {
            resolvedHeaders[key] = String(this.transformer.transform(value, templateContext));
          } else {
            resolvedHeaders[key] = value;
          }
        }
      }

      // Resolve Body
      let resolvedBody: string | undefined;
      if (step.body) {
        if (typeof step.body === "string" && step.body.includes("{{")) {
          resolvedBody = String(this.transformer.transform(step.body, templateContext));
        } else if (typeof step.body === "object" && step.body !== null) {
          // Shallow resolve for object body (could be deeper in real implementation)
          const transformedBody: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(step.body)) {
            if (typeof v === "string" && v.includes("{{")) {
              transformedBody[k] = this.transformer.transform(v, templateContext);
            } else {
              transformedBody[k] = v;
            }
          }
          resolvedBody = JSON.stringify(transformedBody);
        } else {
          resolvedBody = typeof step.body === "string" ? step.body : JSON.stringify(step.body);
        }
      }

      if (
        resolvedBody !== undefined &&
        Buffer.byteLength(resolvedBody, "utf8") > this.maxRequestBytes
      ) {
        return {
          status: "failed",
          error: "HTTP URL policy: request body exceeds the maximum allowed size",
        };
      }

      ctx.logger.info(`HTTP ${step.method} to ${resolvedUrl}`);
      let currentTarget = await resolvePublicHttpUrl(resolvedUrl, { label: "HTTP URL policy" });
      let response: Awaited<ReturnType<typeof fetch>>;

      for (let redirectCount = 0; ; redirectCount += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          response = await fetch(currentTarget.url.toString(), {
            method: step.method as string,
            headers: withoutHostHeader(resolvedHeaders),
            redirect: "manual",
            signal: controller.signal,
            agent: createPinnedAgent(currentTarget.url, selectPinnedAddress(currentTarget)),
            ...(resolvedBody !== undefined ? { body: resolvedBody } : {}),
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!isRedirect(response.status)) {
          break;
        }

        if (redirectCount >= this.maxRedirects) {
          return { status: "failed", error: "HTTP URL policy: too many redirects" };
        }

        const location = response.headers.get("location");
        if (!location) {
          return {
            status: "failed",
            error: "HTTP URL policy: redirect response is missing a location header",
          };
        }

        currentTarget = await resolvePublicHttpUrl(
          new URL(location, currentTarget.url).toString(),
          {
            label: "HTTP URL policy redirect",
          }
        );
      }

      const text = await readLimitedResponseBody(response, this.maxResponseBytes);
      let data = text;
      try {
        data = JSON.parse(text);
      } catch (_e) {
        // Ignore parse error, return as string
      }

      if (!response.ok) {
        return {
          status: "failed",
          error: `HTTP ${response.status} - ${response.statusText}`,
          output: data,
        };
      }

      return { status: "success", output: data };
    } catch (error: unknown) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function selectPinnedAddress(target: Awaited<ReturnType<typeof resolvePublicHttpUrl>>): DnsAddress {
  const address = target.addresses[0];
  if (!address) {
    throw new Error(`HTTP URL policy: host "${target.hostname}" did not resolve`);
  }
  return address;
}

function createPinnedAgent(url: URL, address: DnsAddress): HttpAgent | HttpsAgent {
  const lookup = ((
    _hostname: string,
    _options: unknown,
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
  ): void => {
    callback(null, address.address, address.family);
  }) as never;

  return url.protocol === "http:" ? new HttpAgent({ lookup }) : new HttpsAgent({ lookup });
}

function withoutHostHeader(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "host")
  );
}

async function readLimitedResponseBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return "";
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of response.body as AsyncIterable<Buffer | Uint8Array | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("HTTP URL policy: response body exceeds the maximum allowed size");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}
