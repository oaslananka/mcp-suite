import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { ComposerProxy } from "../../packages/composer/src/proxy/ComposerProxy.js";
import { MockTransport } from "../../packages/shared/src/testing/MockTransport.js";
import { ApprovalGate } from "../../packages/sentinel/src/approval/ApprovalGate.js";
import { AuditLog } from "../../packages/sentinel/src/audit/AuditLog.js";
import { KeyManager } from "../../packages/sentinel/src/auth/KeyManager.js";
import { RequestPipeline } from "../../packages/sentinel/src/proxy/RequestPipeline.js";
import { ResponsePipeline } from "../../packages/sentinel/src/proxy/ResponsePipeline.js";
import { SentinelProxy } from "../../packages/sentinel/src/proxy/SentinelProxy.js";

describe("Composer -> Sentinel integration", () => {
  it("rejects composer-routed tool calls when sentinel policy denies the request", async () => {
    const backendCall = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "should-not-run" }],
    }));
    const backendManager = {
      listClients: () => [{ name: "github", status: "connected" as const }],
      getClient: (name: string) =>
        name === "github"
          ? {
              listTools: async () => ({
                tools: [{ name: "search", description: "Search repositories", inputSchema: { type: "object" } }],
              }),
              listResources: async () => ({ resources: [] }),
              listPrompts: async () => ({ prompts: [] }),
              callTool: backendCall,
            }
          : null,
    };
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    const composer = new ComposerProxy(
      backendManager as never,
      {
        getRouter: () => ({
          on: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => {
            handlers.set(name, handler);
          },
        }),
      } as never,
    );

    const db = new Database(":memory:");
    const keyManager = new KeyManager(db);
    const key = keyManager.create({ name: "ci-client", allowedTools: ["github__*"] });
    const auditLog = new AuditLog(db);
    const sentinel = new SentinelProxy(
      { upstreamCommand: "node upstream.js" },
      new RequestPipeline().use({
        name: "deny-all",
        async process() {
          return { action: "deny", reason: "denied by policy" };
        },
      }),
      new ResponsePipeline(),
      auditLog,
      new ApprovalGate(),
      new MockTransport(),
      keyManager,
    );

    const composerUpstream = {
      listTools: async () => (composer as any).listTools(),
      listResources: async () => (composer as any).listResources(),
      listPrompts: async () => (composer as any).listPrompts(),
      callTool: async (name: string, args?: Record<string, unknown>) =>
        (composer as any).callTool({ name, arguments: args }),
      connect: async () => undefined,
      disconnect: async () => undefined,
    };
    (sentinel as any).upstream = composerUpstream;

    await expect(
      (sentinel as any).handleToolCall({
        name: "github__search",
        arguments: { q: "mcp-suite" },
        headers: { authorization: `Bearer ${key.rawKey}` },
      }),
    ).rejects.toThrow("Sentinel denied call: denied by policy");

    expect(backendCall).not.toHaveBeenCalled();
    expect(auditLog.query({ keyId: key.id })[0]).toMatchObject({
      decision: "deny",
      error: "denied by policy",
    });
    expect(handlers.has("tools/list")).toBe(true);
  });
});
