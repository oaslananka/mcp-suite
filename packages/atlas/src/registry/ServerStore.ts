import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { JSONSchema7 } from "@oaslananka/shared";

export type MCPHealthFailureCategory =
  | "unconfigured"
  | "policy_blocked"
  | "timeout"
  | "transport_error"
  | "command_not_allowed"
  | "command_failed"
  | "output_limit"
  | "malformed_response"
  | "initialize_failed"
  | "incompatible_protocol"
  | "capability_failed";

export type MCPCapabilityStatus = "verified" | "not_supported" | "failed" | "not_checked";
export type MCPLiveness = "reachable" | "unreachable" | "unknown";
export type MCPReadiness = "ready" | "not_ready" | "unknown";

export interface MCPHttpHealthConfig {
  transport: "http";
  url: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  trustedPrivateHosts?: string[];
  headersFromEnv?: Record<string, string>;
}

export interface MCPStdioHealthConfig {
  transport: "stdio";
  command: string;
  args: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
  envFrom?: Record<string, string>;
}

export type MCPHealthConfig = MCPHttpHealthConfig | MCPStdioHealthConfig;

export interface MCPHealthSnapshot {
  status: "online" | "offline" | "degraded";
  liveness: MCPLiveness;
  readiness: MCPReadiness;
  capabilityStatus: MCPCapabilityStatus;
  responseMs: number;
  checkedAt: Date;
  lastSuccessfulAt?: Date;
  negotiatedProtocolVersion?: string;
  failureCategory?: MCPHealthFailureCategory;
  failureMessage?: string;
  toolCount?: number;
}

export interface MCPServerRecord {
  id: string;
  name: string;
  packageName: string;
  version: string;
  description: string;
  author: string;
  transport: Array<"stdio" | "http">;
  tags: string[];
  installCommand: string;
  configSchema?: JSONSchema7;
  homepage?: string;
  healthConfig?: MCPHealthConfig;
  health?: MCPHealthSnapshot;
  license: string;
  verified: boolean;
  downloads: number;
  rating: number;
  qualityScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchFilters {
  verified?: boolean;
  tag?: string;
}

interface HealthRow extends Record<string, unknown> {
  status: MCPHealthSnapshot["status"];
  liveness: MCPLiveness;
  readiness: MCPReadiness;
  capability_status: MCPCapabilityStatus;
  response_ms: number;
  checked_at: string;
  last_successful_at: string | null;
  negotiated_protocol_version: string | null;
  failure_category: MCPHealthFailureCategory | null;
  failure_message: string | null;
  tool_count: number | null;
}

export class ServerStore {
  public readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registry_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        package_name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        transport_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        install_command TEXT NOT NULL,
        config_schema_json TEXT,
        homepage TEXT,
        health_config_json TEXT,
        license TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS health_checks (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        status TEXT NOT NULL,
        response_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        liveness TEXT NOT NULL DEFAULT 'unknown',
        readiness TEXT NOT NULL DEFAULT 'unknown',
        capability_status TEXT NOT NULL DEFAULT 'not_checked',
        checked_at TEXT,
        last_successful_at TEXT,
        negotiated_protocol_version TEXT,
        failure_category TEXT,
        failure_message TEXT,
        tool_count INTEGER
      );
    `);
    this.ensureColumn("registry_servers", "health_config_json", "TEXT");
    this.ensureColumn("health_checks", "liveness", "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("health_checks", "readiness", "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("health_checks", "capability_status", "TEXT NOT NULL DEFAULT 'not_checked'");
    this.ensureColumn("health_checks", "checked_at", "TEXT");
    this.ensureColumn("health_checks", "last_successful_at", "TEXT");
    this.ensureColumn("health_checks", "negotiated_protocol_version", "TEXT");
    this.ensureColumn("health_checks", "failure_category", "TEXT");
    this.ensureColumn("health_checks", "failure_message", "TEXT");
    this.ensureColumn("health_checks", "tool_count", "INTEGER");
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_checks_server_checked
        ON health_checks(server_id, checked_at DESC, created_at DESC);
    `);
  }

  add(
    server: Omit<MCPServerRecord, "id" | "createdAt" | "updatedAt" | "qualityScore" | "health">
  ): MCPServerRecord {
    const record: MCPServerRecord = {
      ...server,
      id: `${server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.insertRecord(record);
    return this.withComputedFields(record);
  }

  findById(id: string): MCPServerRecord | null {
    const row = this.db.prepare("SELECT * FROM registry_servers WHERE id = ? LIMIT 1").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toRecord(row) : null;
  }

  search(query: string, filters: SearchFilters = {}): { items: MCPServerRecord[]; total: number } {
    const allRows = this.db
      .prepare("SELECT * FROM registry_servers ORDER BY verified DESC, downloads DESC, name ASC")
      .all() as Array<Record<string, unknown>>;
    const normalizedQuery = query.trim().toLowerCase();
    const items = allRows
      .map((row) => this.toRecord(row))
      .filter((record) => {
        if (normalizedQuery) {
          const haystack = [
            record.name,
            record.packageName,
            record.description,
            record.author,
            ...record.tags,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        if (filters.verified !== undefined && record.verified !== filters.verified) return false;
        if (filters.tag && !record.tags.includes(filters.tag)) return false;
        return true;
      });
    return { items, total: items.length };
  }

  getTrending(limit = 6): MCPServerRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM registry_servers
         ORDER BY verified DESC, downloads DESC, rating DESC, name ASC LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toRecord(row));
  }

  listTags(): string[] {
    const rows = this.db.prepare("SELECT tags_json FROM registry_servers").all() as Array<
      Record<string, unknown>
    >;
    return [...new Set(rows.flatMap((row) => safeStringArray(String(row["tags_json"]))))].sort(
      (left, right) => left.localeCompare(right)
    );
  }

  getStats(): { total: number; verified: number; tags: number } {
    const total = this.db.prepare("SELECT COUNT(*) AS count FROM registry_servers").get() as {
      count: number;
    };
    const verified = this.db
      .prepare("SELECT COUNT(*) AS count FROM registry_servers WHERE verified = 1")
      .get() as { count: number };
    return { total: total.count, verified: verified.count, tags: this.listTags().length };
  }

  update(id: string, patch: Partial<MCPServerRecord>): MCPServerRecord {
    const existing = this.findById(id);
    if (!existing) throw new Error(`Server "${id}" not found`);
    const updated: MCPServerRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      ...(existing.health ? { health: existing.health } : {}),
      updatedAt: new Date(),
    };
    this.db
      .prepare(
        `UPDATE registry_servers SET
          name = ?, package_name = ?, version = ?, description = ?, author = ?,
          transport_json = ?, tags_json = ?, install_command = ?, config_schema_json = ?,
          homepage = ?, health_config_json = ?, license = ?, verified = ?, downloads = ?,
          rating = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        updated.name,
        updated.packageName,
        updated.version,
        updated.description,
        updated.author,
        JSON.stringify(updated.transport),
        JSON.stringify(updated.tags),
        updated.installCommand,
        updated.configSchema ? JSON.stringify(updated.configSchema) : null,
        updated.homepage ?? null,
        updated.healthConfig ? JSON.stringify(updated.healthConfig) : null,
        updated.license,
        updated.verified ? 1 : 0,
        updated.downloads,
        updated.rating,
        updated.updatedAt.toISOString(),
        updated.id
      );
    return this.withComputedFields(updated);
  }

  delete(id: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM health_checks WHERE server_id = ?").run(id);
      this.db.prepare("DELETE FROM registry_servers WHERE id = ?").run(id);
    });
    transaction();
  }

  seed(servers: MCPServerRecord[]): void {
    for (const server of servers) {
      const existing = this.db
        .prepare("SELECT id FROM registry_servers WHERE id = ? LIMIT 1")
        .get(server.id);
      if (!existing) this.insertRecord(server);
    }
  }

  recordHealthCheck(serverId: string, snapshot: MCPHealthSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO health_checks (
          id, server_id, status, response_ms, created_at, liveness, readiness,
          capability_status, checked_at, last_successful_at, negotiated_protocol_version,
          failure_category, failure_message, tool_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        serverId,
        snapshot.status,
        snapshot.responseMs,
        snapshot.checkedAt.toISOString(),
        snapshot.liveness,
        snapshot.readiness,
        snapshot.capabilityStatus,
        snapshot.checkedAt.toISOString(),
        snapshot.lastSuccessfulAt?.toISOString() ?? null,
        snapshot.negotiatedProtocolVersion ?? null,
        snapshot.failureCategory ?? null,
        snapshot.failureMessage ?? null,
        snapshot.toolCount ?? null
      );
  }

  getLatestHealth(serverId: string): MCPHealthSnapshot | undefined {
    const row = this.db
      .prepare(
        `SELECT status, response_ms, liveness, readiness, capability_status,
                COALESCE(checked_at, created_at) AS checked_at, last_successful_at,
                negotiated_protocol_version, failure_category, failure_message, tool_count
         FROM health_checks WHERE server_id = ?
         ORDER BY COALESCE(checked_at, created_at) DESC, id DESC LIMIT 1`
      )
      .get(serverId) as HealthRow | undefined;
    return row ? this.toHealth(row) : undefined;
  }

  getLastSuccessfulAt(serverId: string): Date | undefined {
    const row = this.db
      .prepare(
        `SELECT COALESCE(last_successful_at, checked_at, created_at) AS succeeded_at
         FROM health_checks
         WHERE server_id = ? AND readiness = 'ready'
         ORDER BY COALESCE(checked_at, created_at) DESC LIMIT 1`
      )
      .get(serverId) as { succeeded_at: string | null } | undefined;
    return row?.succeeded_at ? new Date(row.succeeded_at) : undefined;
  }

  private insertRecord(record: MCPServerRecord): void {
    this.db
      .prepare(
        `INSERT INTO registry_servers (
          id, name, package_name, version, description, author, transport_json, tags_json,
          install_command, config_schema_json, homepage, health_config_json, license,
          verified, downloads, rating, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.name,
        record.packageName,
        record.version,
        record.description,
        record.author,
        JSON.stringify(record.transport),
        JSON.stringify(record.tags),
        record.installCommand,
        record.configSchema ? JSON.stringify(record.configSchema) : null,
        record.homepage ?? null,
        record.healthConfig ? JSON.stringify(record.healthConfig) : null,
        record.license,
        record.verified ? 1 : 0,
        record.downloads,
        record.rating,
        record.createdAt.toISOString(),
        record.updatedAt.toISOString()
      );
  }

  private toRecord(row: Record<string, unknown>): MCPServerRecord {
    const configSchema = parseJson<JSONSchema7>(row["config_schema_json"]);
    const healthConfig = parseJson<MCPHealthConfig>(row["health_config_json"]);
    const homepage = typeof row["homepage"] === "string" ? row["homepage"] : undefined;
    const record: MCPServerRecord = {
      id: String(row["id"]),
      name: String(row["name"]),
      packageName: String(row["package_name"]),
      version: String(row["version"]),
      description: String(row["description"]),
      author: String(row["author"]),
      transport: safeTransportArray(String(row["transport_json"])),
      tags: safeStringArray(String(row["tags_json"])),
      installCommand: String(row["install_command"]),
      ...(configSchema ? { configSchema } : {}),
      ...(homepage ? { homepage } : {}),
      ...(healthConfig ? { healthConfig } : {}),
      license: String(row["license"]),
      verified: Number(row["verified"]) === 1,
      downloads: Number(row["downloads"]),
      rating: Number(row["rating"]),
      createdAt: new Date(String(row["created_at"])),
      updatedAt: new Date(String(row["updated_at"])),
    };
    return this.withComputedFields(record);
  }

  private withComputedFields(record: MCPServerRecord): MCPServerRecord {
    const health = this.getLatestHealth(record.id);
    return {
      ...record,
      ...(health ? { health } : {}),
      qualityScore: this.computeQualityScore(record, health),
    };
  }

  private computeQualityScore(
    record: MCPServerRecord,
    health: MCPHealthSnapshot | undefined
  ): number {
    const verifiedWeight = record.verified ? 20 : 0;
    const downloadWeight = Math.min(35, Math.round(record.downloads / 5_000));
    const ratingWeight = Math.round((record.rating / 5) * 25);
    let healthWeight = 0;
    if (health?.readiness === "ready") {
      healthWeight = 20;
    } else if (health?.liveness === "reachable") {
      healthWeight = 5;
    }
    return Math.min(100, verifiedWeight + downloadWeight + ratingWeight + healthWeight);
  }

  private toHealth(row: HealthRow): MCPHealthSnapshot {
    const lastSuccessfulAt = row.last_successful_at ? new Date(row.last_successful_at) : undefined;
    return {
      status: row.status,
      liveness: row.liveness,
      readiness: row.readiness,
      capabilityStatus: row.capability_status,
      responseMs: Number(row.response_ms),
      checkedAt: new Date(row.checked_at),
      ...(lastSuccessfulAt ? { lastSuccessfulAt } : {}),
      ...(row.negotiated_protocol_version
        ? { negotiatedProtocolVersion: row.negotiated_protocol_version }
        : {}),
      ...(row.failure_category ? { failureCategory: row.failure_category } : {}),
      ...(row.failure_message ? { failureMessage: row.failure_message } : {}),
      ...(row.tool_count !== null ? { toolCount: Number(row.tool_count) } : {}),
    };
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function safeStringArray(value: string): string[] {
  const parsed = parseJson<unknown>(value);
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : [];
}

function safeTransportArray(value: string): Array<"stdio" | "http"> {
  return safeStringArray(value).filter(
    (entry): entry is "stdio" | "http" => entry === "stdio" || entry === "http"
  );
}
