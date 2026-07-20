import { BaseNode } from "./BaseNode.js";
import type { StepConfig } from "../dsl/schema.js";
import type { RunContext } from "../runtime/RunContext.js";
import type { StepResult } from "../engine/Step.js";
import { Transformer } from "../engine/Transformer.js";
import { safeFetchText } from "@oaslananka/shared";

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

      let resolvedUrl = step.url as string;
      if (resolvedUrl.includes("{{")) {
        resolvedUrl = this.transformer.transform(resolvedUrl, templateContext) as string;
      }

      const resolvedHeaders: Record<string, string> = {};
      if (step.headers) {
        for (const [key, value] of Object.entries(step.headers as Record<string, string>)) {
          resolvedHeaders[key] = value.includes("{{")
            ? String(this.transformer.transform(value, templateContext))
            : value;
        }
      }

      let resolvedBody: string | undefined;
      if (step.body) {
        if (typeof step.body === "string" && step.body.includes("{{")) {
          resolvedBody = String(this.transformer.transform(step.body, templateContext));
        } else if (typeof step.body === "object" && step.body !== null) {
          const transformedBody: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(step.body)) {
            transformedBody[key] =
              typeof value === "string" && value.includes("{{")
                ? this.transformer.transform(value, templateContext)
                : value;
          }
          resolvedBody = JSON.stringify(transformedBody);
        } else {
          resolvedBody = typeof step.body === "string" ? step.body : JSON.stringify(step.body);
        }
      }

      ctx.logger.info({ method: step.method }, "Executing outbound HTTP request");
      const response = await safeFetchText(resolvedUrl, {
        label: "HTTP URL policy",
        method: step.method as string,
        headers: resolvedHeaders,
        ...(resolvedBody !== undefined ? { body: resolvedBody } : {}),
        maxRedirects: this.maxRedirects,
        timeoutMs: this.timeoutMs,
        maxRequestBytes: this.maxRequestBytes,
        maxResponseBytes: this.maxResponseBytes,
      });

      let data: unknown = response.bodyText;
      try {
        data = JSON.parse(response.bodyText);
      } catch {
        // Preserve non-JSON response bodies as text.
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
