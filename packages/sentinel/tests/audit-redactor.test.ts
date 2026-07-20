import { describe, expect, it } from "vitest";
import { AuditRedactor } from "../src/audit/AuditRedactor.js";
import type { ToolCallRequest } from "../src/auth/KeyManager.js";

const RAW = {
  bearer: "Bearer super-secret-bearer-token",
  cookie: "session=raw-cookie-value",
  apiKey: "raw-api-key-value",
  password: "correct-horse-battery-staple",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-value",
  virtualKey: "mcp_0123456789abcdef0123456789abcdef0123456789abcdef",
  githubToken: "github_pat_11AAaaBBbbCCccDDddEEee_0123456789abcdef",
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
});
