import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchText } from "../src/security/safeFetch.js";

function headers(values: Record<string, string> = {}): { get(name: string): string | null } {
  const normalized = new Map(
    Object.entries(values).map(([name, value]) => [name.toLowerCase(), value])
  );
  return { get: (name) => normalized.get(name.toLowerCase()) ?? null };
}

function response(options: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  chunks?: Array<string | Buffer>;
}) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: options.statusText ?? "OK",
    headers: headers(options.headers),
    body: Readable.from(options.chunks ?? []),
  };
}

describe("safeFetchText", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves once and pins the reviewed address into the request agent", async () => {
    const lookup = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const fetch = vi.fn().mockResolvedValue(
      response({
        headers: { "content-type": "application/json" },
        chunks: ['{"openapi":"3.1.0"}'],
      })
    );

    const result = await safeFetchText(
      "https://schemas.example.com/openapi.json",
      {
        lookup,
        allowedContentTypes: ["application/json"],
      },
      { fetch: fetch as never }
    );

    expect(result.bodyText).toBe('{"openapi":"3.1.0"}');
    expect(lookup).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as [string, { agent: { options: { lookup: Function } } }];
    await expect(
      new Promise<string>((resolve, reject) => {
        init.agent.options.lookup(
          "schemas.example.com",
          {},
          (error: Error | null, address: string) => (error ? reject(error) : resolve(address))
        );
      })
    ).resolves.toBe("93.184.216.34");
    await expect(
      new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
        init.agent.options.lookup(
          "schemas.example.com",
          { all: true },
          (error: Error | null, addresses: Array<{ address: string; family: number }>) =>
            error ? reject(error) : resolve(addresses)
        );
      })
    ).resolves.toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("revalidates every redirect and fails closed on DNS rebinding", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const fetch = vi.fn().mockResolvedValue(
      response({
        status: 302,
        headers: { location: "/final" },
      })
    );

    await expect(
      safeFetchText("https://schemas.example.com/start", { lookup }, { fetch: fetch as never })
    ).rejects.toThrow(/private|reserved|not allowed/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("blocks private redirect targets and excessive redirects", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const privateRedirectFetch = vi
      .fn()
      .mockResolvedValue(
        response({ status: 302, headers: { location: "https://127.0.0.1/admin" } })
      );

    await expect(
      safeFetchText(
        "https://schemas.example.com/start",
        { lookup },
        { fetch: privateRedirectFetch as never }
      )
    ).rejects.toThrow(/private|reserved|not allowed/i);

    const loopingFetch = vi
      .fn()
      .mockResolvedValue(response({ status: 302, headers: { location: "/again" } }));
    await expect(
      safeFetchText(
        "https://schemas.example.com/start",
        { lookup, maxRedirects: 1 },
        { fetch: loopingFetch as never }
      )
    ).rejects.toThrow(/too many redirects/i);
  });

  it("enforces response limits and supported content types", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(
      safeFetchText(
        "https://schemas.example.com/openapi.yaml",
        { lookup, maxResponseBytes: 4 },
        {
          fetch: vi
            .fn()
            .mockResolvedValue(
              response({ headers: { "content-type": "text/yaml" }, chunks: ["12345"] })
            ) as never,
        }
      )
    ).rejects.toThrow(/maximum allowed size/i);

    await expect(
      safeFetchText(
        "https://schemas.example.com/openapi.yaml",
        { lookup, allowedContentTypes: ["application/json", "text/yaml"] },
        {
          fetch: vi
            .fn()
            .mockResolvedValue(
              response({ headers: { "content-type": "text/html" }, chunks: ["no"] })
            ) as never,
        }
      )
    ).rejects.toThrow(/content type/i);
  });

  it("applies request and read timeouts deterministically", async () => {
    vi.useFakeTimers();
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        })
    );

    const pending = safeFetchText(
      "https://schemas.example.com/openapi.yaml",
      { lookup, timeoutMs: 25 },
      { fetch: fetch as never }
    );
    const rejection = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(30);

    await rejection;
  });

  it("rejects oversized request bodies before DNS or network access", async () => {
    const lookup = vi.fn();
    const fetch = vi.fn();

    await expect(
      safeFetchText(
        "https://schemas.example.com/openapi.yaml",
        { lookup, body: "12345", maxRequestBytes: 4 },
        { fetch: fetch as never }
      )
    ).rejects.toThrow(/request body exceeds/i);

    expect(lookup).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects redirect responses without a location header", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi.fn().mockResolvedValue(response({ status: 302 }));

    await expect(
      safeFetchText(
        "https://schemas.example.com/openapi.yaml",
        { lookup },
        { fetch: fetch as never }
      )
    ).rejects.toThrow(/missing a location header/i);
  });

  it("keeps the timeout active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const stalledBody = new Readable({ read() {} });
    const fetch = vi.fn().mockResolvedValue({
      ...response({ headers: { "content-type": "text/yaml" } }),
      body: stalledBody,
    });

    const pending = safeFetchText(
      "https://schemas.example.com/openapi.yaml",
      { lookup, timeoutMs: 25 },
      { fetch: fetch as never }
    );
    const rejection = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(30);

    await rejection;
  });

  it("converts POST redirects to GET and drops the request body", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 303, headers: { location: "/result" } }))
      .mockResolvedValueOnce(response({ chunks: ["ok"] }));

    await safeFetchText(
      "https://schemas.example.com/start",
      { lookup, method: "POST", body: "secret-body" },
      { fetch: fetch as never }
    );

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: "secret-body" });
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
    expect(fetch.mock.calls[1]?.[1]).not.toHaveProperty("body");
  });

  it("fails closed instead of forwarding request bodies across 307 redirects", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi.fn().mockResolvedValue(
      response({
        status: 307,
        headers: { location: "https://different.example.net/receive" },
      })
    );

    await expect(
      safeFetchText(
        "https://schemas.example.com/start",
        { lookup, method: "POST", body: "secret-body" },
        { fetch: fetch as never }
      )
    ).rejects.toThrow(/cross-origin redirect cannot forward a request body/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not forward credentials across origins", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status: 302,
          headers: { location: "https://cdn.example.net/openapi.yaml" },
        })
      )
      .mockResolvedValueOnce(
        response({ headers: { "content-type": "text/yaml" }, chunks: ["openapi: 3.1.0"] })
      );

    await safeFetchText(
      "https://schemas.example.com/openapi.yaml",
      {
        lookup,
        headers: {
          authorization: "Bearer secret",
          cookie: "session=secret",
          "x-api-key": "api-secret",
          "x-client-secret": "client-secret",
          "x-session-token": "session-token",
          "x-trace-id": "trace-1",
        },
      },
      { fetch: fetch as never }
    );

    const redirectedHeaders = fetch.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(redirectedHeaders).toEqual({ "x-trace-id": "trace-1" });
    expect(redirectedHeaders).not.toHaveProperty("authorization");
    expect(redirectedHeaders).not.toHaveProperty("cookie");
  });
  it("enforces content-length limits before reading and supports empty bodies", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(
      safeFetchText(
        "https://schemas.example.com/openapi.yaml",
        { lookup, maxResponseBytes: 4 },
        {
          fetch: vi
            .fn()
            .mockResolvedValue(
              response({ headers: { "content-length": "5" }, chunks: ["12345"] })
            ) as never,
        }
      )
    ).rejects.toThrow(/maximum allowed size/i);

    const empty = await safeFetchText(
      "https://schemas.example.com/openapi.yaml",
      { lookup },
      { fetch: vi.fn().mockResolvedValue({ ...response({}), body: null }) as never }
    );
    expect(empty.bodyText).toBe("");
  });

  it("strips Host, preserves same-origin credentials, and supports byte request bodies", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ status: 302, headers: { location: "/next" } }))
      .mockResolvedValueOnce(response({ chunks: ["ok"] }));

    await safeFetchText(
      "https://schemas.example.com/start",
      {
        lookup,
        method: "PUT",
        body: new Uint8Array([1, 2, 3]),
        headers: {
          Host: "attacker.example",
          authorization: "Bearer same-origin",
          "content-type": "application/octet-stream",
        },
      },
      { fetch: fetch as never }
    );

    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("headers.Host");
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: "PUT",
      headers: {
        authorization: "Bearer same-origin",
        "content-type": "application/octet-stream",
      },
    });
    expect(fetch.mock.calls[1]?.[1]?.body).toBeInstanceOf(Buffer);
  });

  it("uses an HTTP agent only after explicit HTTPS relaxation", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetch = vi.fn().mockResolvedValue(response({ chunks: ["ok"] }));

    await safeFetchText(
      "http://schemas.example.com/openapi.yaml",
      { lookup, requireHttps: false },
      { fetch: fetch as never }
    );

    const agent = fetch.mock.calls[0]?.[1]?.agent as { protocol?: string };
    expect(agent.protocol).toBe("http:");
  });

  it("normalizes network failures and invalid policy limits without reflecting targets", async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const target = "https://secret-target.example/openapi.yaml";

    const failure = safeFetchText(
      target,
      { lookup },
      { fetch: vi.fn().mockRejectedValue(new Error(`socket failed for ${target}`)) as never }
    );
    await expect(failure).rejects.toThrow("Safe HTTP fetch: request failed");
    await expect(failure).rejects.not.toThrow(target);

    await expect(
      safeFetchText(target, { maxRedirects: -1 }, { fetch: vi.fn() as never })
    ).rejects.toThrow(/non-negative integer/i);
    await expect(
      safeFetchText(target, { timeoutMs: 0 }, { fetch: vi.fn() as never })
    ).rejects.toThrow(/positive integer/i);
  });
});
