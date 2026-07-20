import { describe, expect, it } from "vitest";
import { resolveAuditLogOptions } from "../src/audit/AuditConfig.js";

const DEFAULTS = {
  retentionDays: 30,
  maxRequestBytes: 65536,
  maxErrorBytes: 4096,
  fingerprintSecrets: false,
};

describe("resolveAuditLogOptions", () => {
  it("returns secure defaults when no overrides are provided", () => {
    expect(resolveAuditLogOptions({})).toEqual(DEFAULTS);
  });

  it("parses CLI and environment-shaped values", () => {
    expect(
      resolveAuditLogOptions({
        retentionDays: "45",
        maxRequestBytes: "131072",
        maxErrorBytes: 8192,
        fingerprintSecrets: "true",
      })
    ).toEqual({
      retentionDays: 45,
      maxRequestBytes: 131072,
      maxErrorBytes: 8192,
      fingerprintSecrets: true,
    });
  });

  it.each([
    [{ retentionDays: "0" }, /retentionDays must be an integer between 1 and 3650/],
    [{ retentionDays: "30.5" }, /retentionDays must be an integer/],
    [{ maxRequestBytes: "255" }, /maxRequestBytes must be an integer between 256/],
    [{ maxErrorBytes: "65537" }, /maxErrorBytes must be an integer between 64 and 65536/],
    [{ fingerprintSecrets: "yes" }, /fingerprintSecrets must be true or false/],
  ])("rejects invalid audit configuration %#", (input, message) => {
    expect(() => resolveAuditLogOptions(input)).toThrow(message);
  });
});
