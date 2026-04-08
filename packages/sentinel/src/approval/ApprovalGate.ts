import { ToolCallRequest } from "../auth/KeyManager.js";

export interface ApprovalConfig {
  channels: string[];
  timeout: string;
  on_timeout: "deny" | "approve";
}

function parseDuration(timeout: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(timeout.trim());
  if (!match) {
    return 300_000;
  }

  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    default:
      return 300_000;
  }
}

export class ApprovalGate {
  async hold(_req: ToolCallRequest, config: ApprovalConfig): Promise<"approved" | "denied" | "timeout"> {
    const timeoutMs = parseDuration(config.timeout);
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 10)));
    return config.on_timeout === "approve" ? "approved" : "timeout";
  }
}
