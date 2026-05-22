import { ToolCallRequest } from "../auth/KeyManager.js";
import { Decision, RequestContext } from "../proxy/RequestPipeline.js";

export interface PolicyRule {
  name: string;
  when: (request: ToolCallRequest, ctx: RequestContext) => boolean;
  action: Decision["action"];
  reason?: string;
}

export class PolicyEngine {
  constructor(private readonly rules: PolicyRule[] = []) {}

  evaluate(request: ToolCallRequest, ctx: RequestContext): Decision | null {
    for (const rule of this.rules) {
      if (!rule.when(request, ctx)) {
        continue;
      }

      if (rule.action === "deny") {
        return { action: "deny", reason: rule.reason ?? `Policy "${rule.name}" denied request` };
      }

      if (rule.action === "transform") {
        return { action: "transform", request };
      }

      if (rule.action === "require_approval") {
        return { action: "require_approval" };
      }

      return { action: "allow", request };
    }

    return null;
  }
}
