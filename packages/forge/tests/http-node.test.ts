import { afterEach, describe, expect, it, vi } from "vitest";
import { RunContext } from "../src/runtime/RunContext.js";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("node-fetch", () => ({
  default: fetchMock
}));

import { HttpNode } from "../src/nodes/HttpNode.js";

function createContext(): RunContext {
  const ctx = new RunContext("run-1", "pipeline-1", {}, undefined, {});
  ctx.logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn()
  } as never;
  ctx.dataBus.set("baseUrl", "https://api.example.com");
  ctx.dataBus.set("token", "secret");
  ctx.dataBus.set("payload", { title: "MCP Suite" });
  return ctx;
}

describe("HttpNode", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it("resolves templates, performs fetch, and parses JSON responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ created: true })
    });

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "create-release",
        type: "http",
        url: "{{ baseUrl }}/releases",
        method: "POST",
        headers: {
          authorization: "Bearer {{ token }}"
        },
        body: {
          title: "{{ payload.title }}"
        }
      },
      createContext()
    );

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/releases", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ title: "MCP Suite" })
    });
    expect(result).toEqual({
      status: "success",
      output: { created: true }
    });
  });

  it("returns failed results for non-ok responses and preserves plain text payloads", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "temporarily down"
    });

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "fetch-status",
        type: "http",
        url: "https://status.example.com",
        method: "GET"
      },
      createContext()
    );

    expect(result).toEqual({
      status: "failed",
      error: "HTTP 503 - Service Unavailable",
      output: "temporarily down"
    });
  });
});
