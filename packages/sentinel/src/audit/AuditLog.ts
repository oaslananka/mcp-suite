import type Database from "better-sqlite3";
import {
  AuditRedactor,
  DEFAULT_AUDIT_RETENTION_DAYS,
  type AuditRedactionOptions,
} from "./AuditRedactor.js";
import type { ToolCallRequest, VirtualKey } from "../auth/KeyManager.js";

const CURRENT_REDACTION_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

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

export interface AuditLogOptions extends AuditRedactionOptions {
  retentionDays?: number;
  now?: () => Date;
}

interface StoredAuditRow extends Record<string, unknown> {
  id: string;
  key_id: string;
  tool_name: string;
  decision: string;
  is_error: number;
  error: string | null;
  duration_ms: number | null;
  request_json: string;
  created_at: string;
  redaction_version: number;
}

interface ResolvedAuditLogOptions {
  retentionDays: number;
  now: () => Date;
}

function assertRetentionDays(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("retentionDays must be an integer between 1 and 3650");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coerceHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, nested]) => {
      if (typeof nested === "string") {
        return [name, nested];
      }
      if (
        nested === null ||
        nested === undefined ||
        typeof nested === "number" ||
        typeof nested === "boolean" ||
        typeof nested === "bigint"
      ) {
        return [name, String(nested)];
      }
      return [name, "[INVALID_HEADER]"];
    })
  );
}

function coerceLegacyRequest(value: unknown, fallbackTool: string): ToolCallRequest {
  if (!isRecord(value)) {
    return {
      tool: fallbackTool,
      headers: {},
      input: { _audit: "[REMEDIATED_INVALID_JSON]" },
    };
  }

  return {
    tool: typeof value["tool"] === "string" ? value["tool"] : fallbackTool,
    headers: coerceHeaders(value["headers"]),
    input: isRecord(value["input"]) ? value["input"] : { _audit: "[REMEDIATED_INVALID_INPUT]" },
  };
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export class AuditLog {
  private readonly redactor: AuditRedactor;
  private readonly options: ResolvedAuditLogOptions;

  constructor(
    private readonly db: Database.Database,
    options: AuditLogOptions = {}
  ) {
    this.options = {
      retentionDays: assertRetentionDays(options.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS),
      now: options.now ?? (() => new Date()),
    };
    this.redactor = new AuditRedactor(options);

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
        created_at TEXT NOT NULL,
        redaction_version INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.ensureRedactionVersionColumn();
    this.pruneExpired();
    this.remediateLegacyRows();
  }

  record(entry: AuditEntry): void {
    this.pruneExpired();

    const now = this.options.now();
    const id = `${entry.key.id}_${now.getTime()}_${Math.random().toString(16).slice(2)}`;
    const createdAt = entry.createdAt ?? now;
    const sanitizedRequest = this.redactor.sanitizeRequest(entry.request);
    const sanitizedError = this.redactor.sanitizeError(entry.error);

    this.db
      .prepare(
        `
        INSERT INTO audit_log (
          id, key_id, tool_name, decision, is_error, error, duration_ms,
          request_json, created_at, redaction_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        entry.key.id,
        sanitizedRequest.request.tool,
        entry.decision,
        entry.isError ? 1 : 0,
        sanitizedError ?? null,
        entry.durationMs ?? null,
        sanitizedRequest.serialized,
        createdAt.toISOString(),
        CURRENT_REDACTION_VERSION
      );
  }

  query(filters: AuditFilter = {}): AuditEntry[] {
    this.prepareForRead();

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
      .all(...values) as StoredAuditRow[];

    return rows.map((row) => this.toAuditEntry(row));
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
        entry.createdAt?.toISOString() ?? "",
      ]
        .map((value) => csvCell(value))
        .join(",")
    );
    return [header, ...rows].join("\n");
  }

  pruneExpired(): number {
    const cutoff = new Date(
      this.options.now().getTime() - this.options.retentionDays * DAY_MS
    ).toISOString();
    return this.db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff).changes;
  }

  private ensureRedactionVersionColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(audit_log)").all() as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === "redaction_version")) {
      this.db.exec("ALTER TABLE audit_log ADD COLUMN redaction_version INTEGER NOT NULL DEFAULT 0");
    }
  }

  private prepareForRead(): void {
    this.pruneExpired();
    this.remediateLegacyRows();
  }

  private remediateLegacyRows(): void {
    const rows = this.db
      .prepare(
        `
        SELECT id, tool_name, request_json, error
        FROM audit_log
        WHERE redaction_version < ?
        ORDER BY created_at ASC
      `
      )
      .all(CURRENT_REDACTION_VERSION) as Array<{
      id: string;
      tool_name: string;
      request_json: string;
      error: string | null;
    }>;

    if (rows.length === 0) {
      return;
    }

    const update = this.db.prepare(`
      UPDATE audit_log
      SET tool_name = ?, request_json = ?, error = ?, redaction_version = ?
      WHERE id = ?
    `);
    const remediate = this.db.transaction(() => {
      for (const row of rows) {
        let request: ToolCallRequest;
        try {
          request = coerceLegacyRequest(JSON.parse(row.request_json), row.tool_name);
        } catch {
          request = {
            tool: row.tool_name,
            headers: {},
            input: { _audit: "[REMEDIATED_INVALID_JSON]" },
          };
        }

        const sanitizedRequest = this.redactor.sanitizeRequest(request);
        const sanitizedError = this.redactor.sanitizeError(row.error ?? undefined);
        update.run(
          sanitizedRequest.request.tool,
          sanitizedRequest.serialized,
          sanitizedError ?? null,
          CURRENT_REDACTION_VERSION,
          row.id
        );
      }
    });

    remediate();
  }

  private toAuditEntry(row: StoredAuditRow): AuditEntry {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.request_json);
    } catch {
      parsed = undefined;
    }
    const request = this.redactor.sanitizeRequest(
      coerceLegacyRequest(parsed, row.tool_name)
    ).request;
    const error = this.redactor.sanitizeError(row.error ?? undefined);
    const durationMs = typeof row.duration_ms === "number" ? row.duration_ms : undefined;

    return {
      key: {
        id: String(row.key_id),
        name: String(row.key_id),
        tags: [],
        createdAt: new Date(String(row.created_at)),
        isRevoked: false,
      },
      request,
      decision: row.decision === "deny" ? "deny" : "allow",
      isError: Boolean(row.is_error),
      ...(error ? { error } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      createdAt: new Date(String(row.created_at)),
    };
  }
}
