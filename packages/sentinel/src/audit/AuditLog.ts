import Database from "better-sqlite3";
import { ToolCallRequest, VirtualKey } from "../auth/KeyManager.js";

export interface AuditEntry {
  key: VirtualKey;
  request: ToolCallRequest;
  decision: "allow" | "deny";
  isError?: boolean;
  error?: string;
  durationMs?: number;
  createdAt?: Date;
}

export interface AuditFilter {
  decision?: "allow" | "deny";
  keyId?: string;
}

export class AuditLog {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
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

  record(entry: AuditEntry): void {
    const id = `${entry.key.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const createdAt = entry.createdAt ?? new Date();

    this.db
      .prepare(`
        INSERT INTO audit_log (id, key_id, tool_name, decision, is_error, error, duration_ms, request_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        entry.key.id,
        entry.request.tool,
        entry.decision,
        entry.isError ? 1 : 0,
        entry.error ?? null,
        entry.durationMs ?? null,
        JSON.stringify(entry.request),
        createdAt.toISOString()
      );
  }

  query(filters: AuditFilter = {}): AuditEntry[] {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters.decision) {
      clauses.push("decision = ?");
      values.push(filters.decision);
    }

    if (filters.keyId) {
      clauses.push("key_id = ?");
      values.push(filters.keyId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC`)
      .all(...values) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const error = typeof row["error"] === "string" ? row["error"] : undefined;
      const durationMs = typeof row["duration_ms"] === "number" ? row["duration_ms"] : undefined;

      return {
        key: {
          id: String(row["key_id"]),
          name: String(row["key_id"]),
          tags: [],
          createdAt: new Date(String(row["created_at"])),
          isRevoked: false
        },
        request: JSON.parse(String(row["request_json"])) as ToolCallRequest,
        decision: row["decision"] === "deny" ? "deny" : "allow",
        isError: Boolean(row["is_error"]),
        ...(error ? { error } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        createdAt: new Date(String(row["created_at"]))
      };
    });
  }

  export(format: "json" | "csv", filters: AuditFilter = {}): string {
    const entries = this.query(filters);
    if (format === "json") {
      return JSON.stringify(entries, null, 2);
    }

    const header = "keyId,tool,decision,isError,error,durationMs,createdAt";
    const rows = entries.map((entry) =>
      [
        entry.key.id,
        entry.request.tool,
        entry.decision,
        entry.isError ? "true" : "false",
        entry.error ?? "",
        entry.durationMs ?? "",
        entry.createdAt?.toISOString() ?? ""
      ].join(",")
    );
    return [header, ...rows].join("\n");
  }
}
