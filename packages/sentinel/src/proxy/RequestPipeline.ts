import { ToolCallRequest, VirtualKey } from "../auth/KeyManager.js";

export type Decision =
  | { action: "allow"; request: ToolCallRequest }
  | { action: "deny"; reason: string }
  | { action: "transform"; request: ToolCallRequest }
  | { action: "require_approval" };

export interface RequestContext {
  key: VirtualKey;
}

export interface RequestMiddleware {
  name: string;
  process(req: ToolCallRequest, ctx: RequestContext): Promise<Decision | null>;
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

class ToolAllowlistMiddleware implements RequestMiddleware {
  name = "tool-allowlist";

  async process(req: ToolCallRequest, ctx: RequestContext): Promise<Decision | null> {
    if (!ctx.key.allowedTools || ctx.key.allowedTools.length === 0) {
      return null;
    }

    const allowed = ctx.key.allowedTools.some((pattern) => globMatches(pattern, req.tool));
    if (allowed) {
      return null;
    }

    return { action: "deny", reason: `Tool "${req.tool}" is not allowed for this key` };
  }
}

class RateLimitMiddleware implements RequestMiddleware {
  name = "rate-limit";
  private readonly requestTimes = new Map<string, number[]>();

  async process(_req: ToolCallRequest, ctx: RequestContext): Promise<Decision | null> {
    const limit = ctx.key.rateLimit?.requestsPerMinute;
    if (!limit) {
      return null;
    }

    const now = Date.now();
    const windowStart = now - 60_000;
    const requestTimes = this.requestTimes.get(ctx.key.id) ?? [];
    const recent = requestTimes.filter((timestamp) => timestamp >= windowStart);

    if (recent.length >= limit) {
      this.requestTimes.set(ctx.key.id, recent);
      return { action: "deny", reason: `Rate limit exceeded for key "${ctx.key.id}"` };
    }

    recent.push(now);
    this.requestTimes.set(ctx.key.id, recent);
    return null;
  }
}

export class RequestPipeline {
  private readonly middlewares: RequestMiddleware[] = [
    new ToolAllowlistMiddleware(),
    new RateLimitMiddleware()
  ];

  use(middleware: RequestMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async process(req: ToolCallRequest, ctx: RequestContext): Promise<Decision> {
    for (const middleware of this.middlewares) {
      const decision = await middleware.process(req, ctx);
      if (decision) {
        return decision;
      }
    }

    return { action: "allow", request: req };
  }
}
