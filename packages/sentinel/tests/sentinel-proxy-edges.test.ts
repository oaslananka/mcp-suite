import Database from "better-sqlite3";
import { MockTransport } from "@oaslananka/shared";
import { describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../src/approval/ApprovalGate.js";
import { AuditLog } from "../src/audit/AuditLog.js";
import { KeyManager } from "../src/auth/KeyManager.js";
import type { ToolCallRequest } from "../src/auth/KeyManager.js";
import { RequestPipeline } from "../src/proxy/RequestPipeline.js";
import { ResponsePipeline } from "../src/proxy/ResponsePipeline.js";
import { SentinelProxy } from "../src/proxy/SentinelProxy.js";

interface PrivateProxy {
  handleToolCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<unknown>;
  resolveVirtualKey(rawKey?: string): unknown;
  upstream: {
    callTool: ReturnType<typeof vi.fn>;
  };
}

function createHarness(requestPipeline: RequestPipeline, approvalGate = new ApprovalGate()) {
  const db = new Database(":memory:");
  const keyManager = new KeyManager(db);
  const key = keyManager.create({ name: "client", allowedTools: ["github__*"] });
  const auditLog = new AuditLog(db);
  const proxy = new SentinelProxy(
    { upstreamUrl: "https://upstream.example.com" },
    requestPipeline,
    new ResponsePipeline(),
    auditLog,
    approvalGate,
    new MockTransport(),
    keyManager
  ) as unknown as PrivateProxy;
  proxy.upstream = { callTool: vi.fn(async () => ({ isError: false, content: [] })) };
  return { auditLog, handleToolCall: proxy.handleToolCall.bind(proxy), key, proxy };
}

describe("SentinelProxy edge decisions", () => {
  it("allows approved calls with a capitalized authorization header", async () => {
    const approvalGate = { hold: vi.fn(async () => "approved" as const) };
    const requestPipeline = new RequestPipeline().use({
      name: "needs-approval",
      async process() {
        return { action: "require_approval" };
      },
    });
    const { handleToolCall, key, proxy } = createHarness(
      requestPipeline,
      approvalGate as unknown as ApprovalGate
    );

    await expect(
      handleToolCall({
        name: "github__search_code",
        headers: { Authorization: `Bearer ${key.rawKey}` },
      })
    ).resolves.toEqual({ isError: false, content: [] });
    expect(approvalGate.hold).toHaveBeenCalled();
    expect(proxy.upstream.callTool).toHaveBeenCalledWith("github__search_code", {});
  });

  it("audits transformed calls and unknown upstream failures", async () => {
    const transformed: ToolCallRequest = {
      tool: "github__read_issue",
      input: { number: 9 },
      headers: {},
    };
    const requestPipeline = new RequestPipeline().use({
      name: "rewrite-tool",
      async process() {
        return { action: "transform", request: transformed };
      },
    });
    const { auditLog, handleToolCall, key, proxy } = createHarness(requestPipeline);
    proxy.upstream.callTool.mockRejectedValueOnce("upstream failed");

    await expect(
      handleToolCall({
        name: "github__search_code",
        arguments: { q: "mcp" },
        headers: { authorization: `Bearer ${key.rawKey}` },
      })
    ).rejects.toBe("upstream failed");

    expect(proxy.upstream.callTool).toHaveBeenCalledWith("github__read_issue", { number: 9 });
    expect(auditLog.query({ keyId: key.id })[0]).toMatchObject({
      decision: "allow",
      error: "Unknown upstream error",
      isError: true,
    });
  });

  it("returns anonymous keys when no key manager is configured", () => {
    const proxy = new SentinelProxy(
      { upstreamUrl: "https://upstream.example.com" },
      new RequestPipeline(),
      new ResponsePipeline(),
      new AuditLog(new Database(":memory:")),
      new ApprovalGate(),
      new MockTransport()
    ) as unknown as PrivateProxy;

    expect(proxy.resolveVirtualKey("ignored")).toMatchObject({
      id: "anonymous",
      name: "anonymous",
    });
  });
});
