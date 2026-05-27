import { describe, expect, it } from "vitest";
import { ApprovalGate } from "../src/approval/ApprovalGate.js";

describe("ApprovalGate duration units", () => {
  it("accepts minute and hour timeout units", async () => {
    const gate = new ApprovalGate();
    const request = { tool: "github__search_code", input: {}, headers: {} };

    await expect(
      gate.hold(request, { channels: ["default"], timeout: "1m", on_timeout: "approve" })
    ).resolves.toBe("approved");
    await expect(
      gate.hold(request, { channels: ["default"], timeout: "1h", on_timeout: "deny" })
    ).resolves.toBe("timeout");
  });
});
