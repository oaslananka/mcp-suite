import { describe, expect, it } from "vitest";
import type { ToolCallRequest, VirtualKey } from "../src/auth/KeyManager.js";
import { PolicyEngine } from "../src/policy/PolicyEngine.js";

const REQUEST: ToolCallRequest = {
  tool: "github__search_code",
  input: { query: "mcp" },
  headers: {},
};

const KEY: VirtualKey = {
  id: "key-1",
  name: "policy-key",
  tags: [],
  createdAt: new Date(),
  isRevoked: false,
};

describe("PolicyEngine", () => {
  it("returns the first matching deny, transform, approval, or allow decision", () => {
    const engine = new PolicyEngine([
      {
        name: "deny-search",
        when: (request) => request.tool === "github__search_code",
        action: "deny",
      },
    ]);

    expect(engine.evaluate(REQUEST, { key: KEY })).toEqual({
      action: "deny",
      reason: 'Policy "deny-search" denied request',
    });

    const transformEngine = new PolicyEngine([
      {
        name: "transform",
        when: () => true,
        action: "transform",
      },
    ]);
    expect(transformEngine.evaluate(REQUEST, { key: KEY })).toEqual({
      action: "transform",
      request: REQUEST,
    });

    const approvalEngine = new PolicyEngine([
      {
        name: "approval",
        when: () => true,
        action: "require_approval",
      },
    ]);
    expect(approvalEngine.evaluate(REQUEST, { key: KEY })).toEqual({
      action: "require_approval",
    });

    const allowEngine = new PolicyEngine([
      {
        name: "allow",
        when: () => true,
        action: "allow",
      },
    ]);
    expect(allowEngine.evaluate(REQUEST, { key: KEY })).toEqual({
      action: "allow",
      request: REQUEST,
    });

    expect(new PolicyEngine().evaluate(REQUEST, { key: KEY })).toBeNull();
  });
});
