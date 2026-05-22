import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { RunContext } from "../src/runtime/RunContext.js";

const fetchMock = vi.hoisted(() => vi.fn());
const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node-fetch", () => ({
  default: fetchMock,
}));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

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

describe("HttpNode", () => {
  afterEach(() => {
    fetchMock.mockReset();
    lookupMock.mockReset();
    vi.restoreAllMocks();
  });

  it("resolves templates, performs fetch, and parses JSON responses", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: Readable.from([JSON.stringify({ created: true })]),
      text: async () => JSON.stringify({ created: true }),
    });

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
      createContext()
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/releases",
      expect.objectContaining({
        body: JSON.stringify({ title: "MCP Suite" }),
        headers: { authorization: "Bearer secret" },
        method: "POST",
        redirect: "manual",
        signal: expect.any(AbortSignal),
        agent: expect.any(Object),
      })
    );
    const [, fetchOptions] = fetchMock.mock.calls[0] as [
      string,
      { agent: { options: { lookup: Function } } },
    ];
    await expect(
      new Promise<string>((resolve, reject) => {
        fetchOptions.agent.options.lookup(
          "api.example.com",
          {},
          (error: Error | null, address: string) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(address);
          }
        );
      })
    ).resolves.toBe("203.0.113.10");
    expect(result).toEqual({
      status: "success",
      output: { created: true },
    });
  });

  it("returns failed results for non-ok responses and preserves plain text payloads", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.20", family: 4 }]);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      body: Readable.from(["temporarily down"]),
      text: async () => "temporarily down",
    });

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

  it.each([
    "http://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/admin",
    "https://localhost/status",
    "https://10.0.0.8/internal",
    "https://[::1]/admin",
    "https://[fd00::1]/admin",
  ])("blocks private or non-HTTPS HTTP targets before fetching: %s", async (url) => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "blocked",
        type: "http",
        url,
        method: "GET",
      },
      createContext()
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/HTTP URL policy|private|loopback|HTTPS/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechecks redirect targets and blocks redirects to private networks", async () => {
    lookupMock.mockImplementation(async (hostname: string) => {
      if (hostname === "api.example.com") {
        return [{ address: "203.0.113.30", family: 4 }];
      }
      return [{ address: "127.0.0.1", family: 4 }];
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "location" ? "https://127.0.0.1/admin" : null,
      },
      text: async () => "",
    });

    const node = new HttpNode();
    const result = await node.execute(
      {
        id: "redirect",
        type: "http",
        url: "https://api.example.com/redirect",
        method: "GET",
      },
      createContext()
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/redirect|private|loopback/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces the response byte limit while reading the response stream", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.40", family: 4 }]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      body: Readable.from([Buffer.alloc(1_000_001, "x")]),
    });

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
});
