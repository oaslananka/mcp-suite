import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { MockTransport } from "@oaslananka/shared";
import { ApprovalGate } from "../src/approval/ApprovalGate.js";
import { AuditLog } from "../src/audit/AuditLog.js";
import { KeyManager } from "../src/auth/KeyManager.js";
import { RequestPipeline } from "../src/proxy/RequestPipeline.js";
import { ResponsePipeline } from "../src/proxy/ResponsePipeline.js";
import { SentinelProxy } from "../src/proxy/SentinelProxy.js";

describe("ApprovalGate, AuditLog, and SentinelProxy", () => {
  it("holds requests using timeout policy and exports audit records", async () => {
    const gate = new ApprovalGate();
    await expect(gate.hold({
      tool: "github__search_code",
      input: {},
      headers: {},
    }, {
      channels: ["slack"],
      timeout: "5ms",
      on_timeout: "deny",
    })).resolves.toBe("timeout");
    await expect(gate.hold({
      tool: "github__search_code",
      input: {},
      headers: {},
    }, {
      channels: ["slack"],
      timeout: "1s",
      on_timeout: "approve",
    })).resolves.toBe("approved");
    await expect(gate.hold({
      tool: "github__search_code",
      input: {},
      headers: {},
    }, {
      channels: ["slack"],
      timeout: "nonsense",
      on_timeout: "deny",
    })).resolves.toBe("timeout");

    const db = new Database(":memory:");
    const auditLog = new AuditLog(db);
    auditLog.record({
      key: { id: "key-1", name: "key-1", tags: [], createdAt: new Date(), isRevoked: false },
      request: { tool: "github__search_code", input: { q: "mcp" }, headers: {} },
      decision: "allow",
      durationMs: 42,
    });

    expect(auditLog.query({ keyId: "key-1" })).toEqual([
      expect.objectContaining({
        decision: "allow",
        request: expect.objectContaining({ tool: "github__search_code" }),
      }),
    ]);
    expect(auditLog.query({ decision: "deny" })).toEqual([]);
    expect(auditLog.export("csv")).toContain("keyId,tool,decision");
    expect(auditLog.export("json")).toContain("\"github__search_code\"");
  });

  it("proxies tool calls, resolves virtual keys, and records approvals and upstream errors", async () => {
    const db = new Database(":memory:");
    const keyManager = new KeyManager(db);
    const key = keyManager.create({ name: "client", allowedTools: ["github__*"] });
    const auditLog = new AuditLog(db);

    const proxy = new SentinelProxy(
      { upstreamCommand: "node upstream.js" },
      new RequestPipeline(),
      new ResponsePipeline(),
      auditLog,
      new ApprovalGate(),
      new MockTransport(),
      keyManager,
    );

    const upstream = {
      listTools: vi.fn(async () => ({ tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }] })),
      listResources: vi.fn(async () => ({ resources: [{ uri: "file://repo", name: "Repo" }] })),
      listPrompts: vi.fn(async () => ({ prompts: [{ name: "triage", description: "Prompt" }] })),
      callTool: vi.fn(async (tool: string) => ({
        content: [{ type: "text", text: `ok:${tool}` }],
      })),
      disconnect: vi.fn(async () => undefined),
      connect: vi.fn(async () => undefined),
    };
    (proxy as any).upstream = upstream;

    expect(await (proxy as any).handleListTools()).toEqual({
      tools: [{ name: "search", description: "Search", inputSchema: { type: "object" } }],
    });
    expect(await (proxy as any).handleListResources()).toEqual({
      resources: [{ uri: "file://repo", name: "Repo" }],
    });
    expect(await (proxy as any).handleListPrompts()).toEqual({
      prompts: [{ name: "triage", description: "Prompt" }],
    });

    const allowed = await (proxy as any).handleToolCall({
      name: "github__search_code",
      arguments: { q: "mcp" },
      headers: { authorization: `Bearer ${key.rawKey}` },
    });
    expect(allowed).toMatchObject({
      content: [{ type: "text", text: "ok:github__search_code" }],
    });
    expect(auditLog.query({ keyId: key.id })[0]).toMatchObject({
      decision: "allow",
    });

    upstream.callTool.mockRejectedValueOnce(new Error("upstream failed"));
    await expect((proxy as any).handleToolCall({
      name: "github__search_code",
      arguments: { q: "mcp" },
      headers: { authorization: `Bearer ${key.rawKey}` },
    })).rejects.toThrow("upstream failed");

    const denyProxy = new SentinelProxy(
      { upstreamCommand: "node upstream.js" },
      new RequestPipeline().use({
        name: "approval-required",
        async process() {
          return { action: "require_approval" };
        },
      }),
      new ResponsePipeline(),
      auditLog,
      {
        hold: vi.fn(async () => "timeout"),
      } as unknown as ApprovalGate,
      new MockTransport(),
      keyManager,
    );
    (denyProxy as any).upstream = upstream;

    await expect((denyProxy as any).handleToolCall({
      name: "github__search_code",
      arguments: { q: "mcp" },
      headers: { authorization: `Bearer ${key.rawKey}` },
    })).rejects.toThrow("Approval failed");

    expect((proxy as any).resolveVirtualKey("missing")).toMatchObject({
      id: "anonymous",
      name: "anonymous",
    });
  });
});
