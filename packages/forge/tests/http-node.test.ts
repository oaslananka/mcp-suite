import { afterEach, describe, expect, it, vi } from "vitest";
import { RunContext } from "../src/runtime/RunContext.js";

const safeFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@oaslananka/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@oaslananka/shared")>();
  return {
    ...actual,
    safeFetchText: safeFetchMock,
  };
});

import { HttpNode } from "../src/nodes/HttpNode.js";

function createContext(): RunContext {
  const ctx = new RunContext("run-1", "pipeline-1", {}, undefined, {});
  ctx.logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as never;
  ctx.dataBus.set("baseUrl", "https://api.example.com");
  ctx.dataBus.set("token", "secret");
  ctx.dataBus.set("payload", { title: "MCP Suite" });
  return ctx;
}

function safeResponse(
  bodyText: string,
  options: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  return {
    bodyText,
    finalUrl: new URL("https://api.example.com/final"),
    headers: new Headers(),
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
  };
}

describe("HttpNode", () => {
  afterEach(() => {
    safeFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it("resolves templates and delegates to the shared hardened fetch policy", async () => {
    safeFetchMock.mockResolvedValue(safeResponse(JSON.stringify({ created: true })));

    const ctx = createContext();
    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "create-release",
        type: "http",
        url: "{{ baseUrl }}/releases",
        method: "POST",
        headers: {
          authorization: "Bearer {{ token }}",
        },
        body: {
          title: "{{ payload.title }}",
        },
      },
      ctx
    );

    expect(safeFetchMock).toHaveBeenCalledWith("https://api.example.com/releases", {
      label: "HTTP URL policy",
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ title: "MCP Suite" }),
      maxRedirects: 3,
      timeoutMs: 10_000,
      maxRequestBytes: 1_000_000,
      maxResponseBytes: 1_000_000,
    });
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { method: "POST" },
      "Executing outbound HTTP request"
    );
    expect(ctx.logger.info).not.toHaveBeenCalledWith(expect.stringContaining("api.example.com"));
    expect(result).toEqual({
      status: "success",
      output: { created: true },
    });
  });

  it("returns failed results for non-ok responses and preserves plain text payloads", async () => {
    safeFetchMock.mockResolvedValue(
      safeResponse("temporarily down", {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "fetch-status",
        type: "http",
        url: "https://status.example.com",
        method: "GET",
      },
      createContext()
    );

    expect(result).toEqual({
      status: "failed",
      error: "HTTP 503 - Service Unavailable",
      output: "temporarily down",
    });
  });

  it("propagates shared URL-policy failures without performing alternate network access", async () => {
    safeFetchMock.mockRejectedValue(
      new Error("HTTP URL policy: private or reserved targets are not allowed")
    );

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "blocked",
        type: "http",
        url: "https://127.0.0.1/admin",
        method: "GET",
      },
      createContext()
    );

    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "failed",
      error: "HTTP URL policy: private or reserved targets are not allowed",
    });
  });

  it("preserves the shared response-size failure", async () => {
    safeFetchMock.mockRejectedValue(
      new Error("HTTP URL policy: response body exceeds the maximum allowed size")
    );

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "large-response",
        type: "http",
        url: "https://api.example.com/large",
        method: "GET",
      },
      createContext()
    );

    expect(result).toEqual({
      status: "failed",
      error: "HTTP URL policy: response body exceeds the maximum allowed size",
    });
  });

  it("rejects incomplete HTTP node definitions before invoking the shared fetcher", async () => {
    const node = new HttpNode();
    const result = await node.execute({ id: "invalid", type: "http" } as never, createContext());

    expect(result).toEqual({ status: "failed", error: "Missing url or method in HTTP node" });
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
