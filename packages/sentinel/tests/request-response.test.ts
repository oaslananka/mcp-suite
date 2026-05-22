import Database from "better-sqlite3";
import { MockTransport } from "@oaslananka/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalGate } from "../src/approval/ApprovalGate.js";
import { AuditLog } from "../src/audit/AuditLog.js";
import { KeyManager, type VirtualKey } from "../src/auth/KeyManager.js";
import { RequestPipeline } from "../src/proxy/RequestPipeline.js";
import { ResponsePipeline } from "../src/proxy/ResponsePipeline.js";
import { SentinelProxy } from "../src/proxy/SentinelProxy.js";

const KEY: VirtualKey = {
  id: "key-1",
  name: "request-key",
  tags: [],
  createdAt: new Date(),
  allowedTools: ["github__*"],
  rateLimit: { requestsPerMinute: 2 },
  isRevoked: false,
};

describe("RequestPipeline and ResponsePipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enforces tool allowlists and per-minute rate limits", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_200);

    const pipeline = new RequestPipeline();

    expect(
      await pipeline.process(
        {
          tool: "filesystem__read_file",
          input: {},
          headers: {},
        },
        { key: KEY }
      )
    ).toEqual({
      action: "deny",
      reason: 'Tool "filesystem__read_file" is not allowed for this key',
    });

    expect(
      await pipeline.process(
        {
          tool: "github__search_code",
          input: {},
          headers: {},
        },
        { key: KEY }
      )
    ).toEqual({
      action: "allow",
      request: {
        tool: "github__search_code",
        input: {},
        headers: {},
      },
    });

    expect(
      await pipeline.process(
        {
          tool: "github__read_issue",
          input: {},
          headers: {},
        },
        { key: KEY }
      )
    ).toEqual({
      action: "allow",
      request: {
        tool: "github__read_issue",
        input: {},
        headers: {},
      },
    });

    expect(
      await pipeline.process(
        {
          tool: "github__read_issue",
          input: {},
          headers: {},
        },
        { key: KEY }
      )
    ).toEqual({
      action: "deny",
      reason: 'Rate limit exceeded for key "key-1"',
    });
  });

  it("treats empty allowlists as allow none and requires explicit wildcard access", async () => {
    const pipeline = new RequestPipeline();
    const emptyAllowlistKey: VirtualKey = {
      id: "empty",
      name: "empty",
      tags: [],
      createdAt: new Date(),
      allowedTools: [],
      isRevoked: false,
    };
    const wildcardKey: VirtualKey = {
      id: "wildcard",
      name: "wildcard",
      tags: [],
      createdAt: new Date(),
      allowedTools: ["*"],
      isRevoked: false,
    };

    await expect(
      pipeline.process(
        { tool: "github__search_code", input: {}, headers: {} },
        { key: emptyAllowlistKey }
      )
    ).resolves.toEqual({
      action: "deny",
      reason: 'Tool "github__search_code" is not allowed for this key',
    });

    await expect(
      pipeline.process(
        { tool: "filesystem__read_file", input: {}, headers: {} },
        { key: wildcardKey }
      )
    ).resolves.toEqual({
      action: "allow",
      request: { tool: "filesystem__read_file", input: {}, headers: {} },
    });
  });

  it("fails closed for missing and invalid bearer tokens", async () => {
    const db = new Database(":memory:");
    const keyManager = new KeyManager(db);
    const restrictedKey = keyManager.create({
      name: "restricted",
      allowedTools: ["github__*"],
    });
    const allToolsKey = keyManager.create({
      name: "all-tools",
      allowedTools: ["*"],
    });
    const proxy = new SentinelProxy(
      { upstreamUrl: "https://upstream.example.com" },
      new RequestPipeline(),
      new ResponsePipeline(),
      new AuditLog(db),
      new ApprovalGate(),
      new MockTransport(),
      keyManager
    );
    const upstream = {
      callTool: vi.fn().mockResolvedValue({ isError: false, content: [] }),
    };
    (proxy as unknown as { upstream: typeof upstream }).upstream = upstream;
    const handleToolCall = (
      proxy as unknown as {
        handleToolCall: (params: {
          name: string;
          arguments?: Record<string, unknown>;
          headers?: Record<string, string>;
        }) => Promise<unknown>;
      }
    ).handleToolCall.bind(proxy);

    await expect(handleToolCall({ name: "github__search_code", headers: {} })).rejects.toThrow(
      'Tool "github__search_code" is not allowed for this key'
    );
    await expect(
      handleToolCall({
        name: "github__search_code",
        headers: { authorization: "Bearer invalid" },
      })
    ).rejects.toThrow('Tool "github__search_code" is not allowed for this key');
    await expect(
      handleToolCall({
        name: "filesystem__read_file",
        headers: { authorization: `Bearer ${restrictedKey.rawKey}` },
      })
    ).rejects.toThrow('Tool "filesystem__read_file" is not allowed for this key');

    await expect(
      handleToolCall({
        name: "github__search_code",
        headers: { authorization: `Bearer ${restrictedKey.rawKey}` },
      })
    ).resolves.toEqual({ isError: false, content: [] });
    await expect(
      handleToolCall({
        name: "filesystem__read_file",
        headers: { authorization: `Bearer ${allToolsKey.rawKey}` },
      })
    ).resolves.toEqual({ isError: false, content: [] });
    expect(upstream.callTool).toHaveBeenCalledTimes(2);
  });

  it("redacts PII in tool responses and supports custom middlewares", async () => {
    const pipeline = new ResponsePipeline().use({
      name: "append",
      async process(response) {
        return {
          ...response,
          metadata: { sanitized: true },
        };
      },
    });

    const result = await pipeline.process(
      {
        content: [
          {
            type: "text",
            text: "Contact me at jane@example.com",
          },
        ],
      },
      { key: KEY }
    );

    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: expect.stringContaining("***@***.***"),
        },
      ],
      metadata: { sanitized: true },
    });
  });
});
