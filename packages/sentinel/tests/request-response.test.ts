import { afterEach, describe, expect, it, vi } from "vitest";
import type { VirtualKey } from "../src/auth/KeyManager.js";
import { RequestPipeline } from "../src/proxy/RequestPipeline.js";
import { ResponsePipeline } from "../src/proxy/ResponsePipeline.js";

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

    expect(await pipeline.process({
      tool: "filesystem__read_file",
      input: {},
      headers: {},
    }, { key: KEY })).toEqual({
      action: "deny",
      reason: 'Tool "filesystem__read_file" is not allowed for this key',
    });

    expect(await pipeline.process({
      tool: "github__search_code",
      input: {},
      headers: {},
    }, { key: KEY })).toEqual({
      action: "allow",
      request: {
        tool: "github__search_code",
        input: {},
        headers: {},
      },
    });

    expect(await pipeline.process({
      tool: "github__read_issue",
      input: {},
      headers: {},
    }, { key: KEY })).toEqual({
      action: "allow",
      request: {
        tool: "github__read_issue",
        input: {},
        headers: {},
      },
    });

    expect(await pipeline.process({
      tool: "github__read_issue",
      input: {},
      headers: {},
    }, { key: KEY })).toEqual({
      action: "deny",
      reason: 'Rate limit exceeded for key "key-1"',
    });
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

    const result = await pipeline.process({
      content: [
        {
          type: "text",
          text: "Contact me at jane@example.com",
        },
      ],
    }, { key: KEY });

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
