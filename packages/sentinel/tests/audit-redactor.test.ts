import { describe, expect, it } from "vitest";
import { AuditRedactor } from "../src/audit/AuditRedactor.js";
import type { ToolCallRequest } from "../src/auth/KeyManager.js";

const RAW = {
  bearer: "Bearer super-secret-bearer-token",
  cookie: "session=raw-cookie-value",
  apiKey: "raw-api-key-value",
  password: "correct-horse-battery-staple",
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "signature-value"].join("."),
  virtualKey: `mcp_${"0123456789abcdef".repeat(3)}`,
  githubToken: `github_${"pat"}_11AAaaBBbbCCccDDddEEee_${"0123456789abcdef"}`,
  email: "operator@example.com",
} as const;

function requestWithSecrets(): ToolCallRequest {
  return {
    tool: "github__search_code",
    headers: {
      Authorization: RAW.bearer,
      COOKIE: RAW.cookie,
      "X-Api-Key": RAW.apiKey,
      "user-agent": `sentinel-test ${RAW.email}`,
    },
    input: {
      password: RAW.password,
      nested: {
        Access_Token: RAW.jwt,
        values: [
          { clientSecret: RAW.githubToken },
          `contact ${RAW.email}`,
          `virtual key ${RAW.virtualKey}`,
        ],
      },
      freeform: `Authorization: ${RAW.bearer}; token=${RAW.apiKey}`,
    },
  };
}

function expectNoRawSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of Object.values(RAW)) {
    expect(serialized).not.toContain(secret);
  }
}

describe("AuditRedactor", () => {
  it("redacts sensitive headers, nested secret keys, credential text, and PII without mutating input", () => {
    const request = requestWithSecrets();
    const original = structuredClone(request);
    const redactor = new AuditRedactor();

    const result = redactor.sanitizeRequest(request);

    expect(request).toEqual(original);
    expect(result.truncated).toBe(false);
    expect(result.request.headers).toMatchObject({
      Authorization: "[REDACTED]",
      COOKIE: "[REDACTED]",
      "X-Api-Key": "[REDACTED]",
      "user-agent": "sentinel-test ***@***.***",
    });
    expect(result.request.input).toMatchObject({
      password: "[REDACTED]",
      nested: {
        Access_Token: "[REDACTED]",
        values: [{ clientSecret: "[REDACTED]" }, "contact ***@***.***", "virtual key [REDACTED]"],
      },
    });
    expect(result.serialized).toBe(JSON.stringify(result.request));
    expectNoRawSecrets(result.request);
  });

  it("uses deterministic non-reversible fingerprints only when requested", () => {
    const redactor = new AuditRedactor({ fingerprintSecrets: true });
    const first = redactor.sanitizeRequest(requestWithSecrets()).request;
    const second = redactor.sanitizeRequest(requestWithSecrets()).request;

    const firstMarker = first.headers.Authorization;
    expect(firstMarker).toMatch(/^\[REDACTED sha256:[a-f0-9]{12}\]$/);
    expect(second.headers.Authorization).toBe(firstMarker);
    expect(first.input["password"]).toMatch(/^\[REDACTED sha256:[a-f0-9]{12}\]$/);
    expectNoRawSecrets(first);
  });

  it("redacts and bounds error messages after sanitization", () => {
    const redactor = new AuditRedactor({ maxErrorBytes: 128 });
    const error = redactor.sanitizeError(
      `upstream failed Authorization: ${RAW.bearer} email=${RAW.email} ${"x".repeat(500)}`
    );

    expect(Buffer.byteLength(error, "utf8")).toBeLessThanOrEqual(128);
    expect(error).toContain("[REDACTED]");
    expect(error).toContain("[TRUNCATED]");
    expectNoRawSecrets(error);
  });

  it("redacts before replacing oversized requests with a valid bounded summary", () => {
    const redactor = new AuditRedactor({ maxRequestBytes: 512 });
    const request = requestWithSecrets();
    request.input["oversized"] = `${RAW.password}:${"payload".repeat(1000)}`;

    const result = redactor.sanitizeRequest(request);

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.serialized, "utf8")).toBeLessThanOrEqual(512);
    expect(() => JSON.parse(result.serialized)).not.toThrow();
    expect(result.request.input).toMatchObject({
      _audit: expect.stringContaining("TRUNCATED"),
    });
    expectNoRawSecrets(result.request);
  });

  it("handles circular and overly deep values without serializing source objects", () => {
    const redactor = new AuditRedactor({ maxDepth: 3 });
    const circular: Record<string, unknown> = { secret: RAW.apiKey };
    circular["self"] = circular;

    const result = redactor.sanitizeRequest({
      tool: "test",
      headers: {},
      input: {
        circular,
        deep: { one: { two: { three: { password: RAW.password } } } },
      },
    });

    expect(result.serialized).toContain("[CIRCULAR]");
    expect(result.serialized).toContain("[MAX_DEPTH]");
    expectNoRawSecrets(result.request);
  });

  it("redacts credential formats that only appear in free-form text", () => {
    const redactor = new AuditRedactor();
    const request = redactor.sanitizeRequest({
      tool: "log_message",
      headers: {},
      input: {
        message: [
          `Bearer ${RAW.apiKey}`,
          RAW.jwt,
          RAW.githubToken,
          `client_secret=${RAW.password}`,
        ].join(" | "),
      },
    }).request;

    expectNoRawSecrets(request);
    expect(String(request.input["message"]).match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(
      4
    );
  });

  it("handles primitive, special, and fingerprinted secret values without leaking or throwing", () => {
    const redactor = new AuditRedactor({ fingerprintSecrets: true });
    const circularSecret: Record<string, unknown> = { value: "safe" };
    circularSecret["self"] = circularSecret;
    const shared = { value: "shared" };

    const result = redactor.sanitizeRequest({
      tool: "runtime_values",
      headers: {},
      input: {
        nil: null,
        missing: undefined,
        count: 42,
        enabled: true,
        bigint: 9007199254740993n,
        symbolValue: Symbol("not-serializable"),
        functionValue: () => "not-serializable",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        list: [1, false, null],
        sharedA: shared,
        sharedB: shared,
        nullSecret: null,
        numberToken: 1234,
        booleanSecret: false,
        bigintToken: 99n,
        symbolToken: Symbol("secret-symbol"),
        functionSecret: () => "secret-function",
        objectSecret: circularSecret,
      },
    });

    expect(result.request.input).toMatchObject({
      nil: null,
      count: 42,
      enabled: true,
      bigint: "9007199254740993",
      symbolValue: "[UNSERIALIZABLE]",
      functionValue: "[UNSERIALIZABLE]",
      createdAt: "2026-07-20T00:00:00.000Z",
      list: [1, false, null],
      sharedA: { value: "shared" },
      sharedB: { value: "shared" },
    });
    for (const key of [
      "nullSecret",
      "numberToken",
      "booleanSecret",
      "bigintToken",
      "symbolToken",
      "functionSecret",
      "objectSecret",
    ]) {
      expect(result.request.input[key]).toMatch(/^\[REDACTED sha256:[a-f0-9]{12}\]$/);
    }
  });

  it("fails closed for hostile runtime objects and invalid dates", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile object");
        },
      }
    );

    const result = new AuditRedactor().sanitizeRequest({
      tool: "hostile_values",
      headers: {},
      input: {
        hostile,
        invalidDate: new Date(Number.NaN),
      },
    });

    expect(result.request.input).toMatchObject({
      hostile: "[UNSERIALIZABLE]",
      invalidDate: "[INVALID_DATE]",
    });
  });

  it("always emits a bounded summary for adversarial oversized tool names", () => {
    const redactor = new AuditRedactor({ maxRequestBytes: 256 });
    const result = redactor.sanitizeRequest({
      tool: '\u0000\\"'.repeat(1000),
      headers: {},
      input: { payload: "x".repeat(5000) },
    });

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.serialized, "utf8")).toBeLessThanOrEqual(256);
    expect(() => JSON.parse(result.serialized)).not.toThrow();
  });

  it("rejects unsafe direct redactor limits and invalid runtime input shapes", () => {
    expect(() => new AuditRedactor({ maxRequestBytes: 255 })).toThrow(/maxRequestBytes/);
    expect(() => new AuditRedactor({ maxErrorBytes: 63 })).toThrow(/maxErrorBytes/);
    expect(() => new AuditRedactor({ maxDepth: 0 })).toThrow(/maxDepth/);

    const invalidArray = new AuditRedactor().sanitizeRequest({
      tool: "invalid",
      headers: {},
      input: [] as unknown as Record<string, unknown>,
    });
    const invalidNull = new AuditRedactor().sanitizeRequest({
      tool: "invalid",
      headers: {},
      input: null as unknown as Record<string, unknown>,
    });

    expect(invalidArray.request.input).toEqual({ _audit: "[INVALID_INPUT]" });
    expect(invalidNull.request.input).toEqual({ _audit: "[INVALID_INPUT]" });
  });
});
