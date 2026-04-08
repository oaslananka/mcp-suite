import Database from "better-sqlite3";
import { JSONSchema7 } from "@oaslananka/shared";

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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  add(server: Omit<MCPServerRecord, "id" | "createdAt" | "updatedAt" | "qualityScore">): MCPServerRecord {
    const record: MCPServerRecord = {
      ...server,
      id: `${server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.db.prepare(`
      INSERT INTO registry_servers (
        id, name, package_name, version, description, author, transport_json, tags_json,
        install_command, config_schema_json, homepage, license, verified, downloads, rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      record.license,
      record.verified ? 1 : 0,
      record.downloads,
      record.rating,
      record.createdAt.toISOString(),
      record.updatedAt.toISOString(),
    );

    return {
      ...record,
      qualityScore: this.computeQualityScore(record),
    };
  }

  findById(id: string): MCPServerRecord | null {
    const row = this.db.prepare("SELECT * FROM registry_servers WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : null;
  }

  search(query: string, filters: SearchFilters = {}): { items: MCPServerRecord[]; total: number } {
    const allRows = this.db.prepare("SELECT * FROM registry_servers ORDER BY verified DESC, downloads DESC, name ASC").all() as Array<Record<string, unknown>>;
    const normalizedQuery = query.trim().toLowerCase();

    const items = allRows
      .map((row) => this.toRecord(row))
      .filter((record) => {
        if (normalizedQuery) {
          const haystack = [record.name, record.packageName, record.description, record.author, ...record.tags]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) {
            return false;
          }
        }

        if (filters.verified !== undefined && record.verified !== filters.verified) {
          return false;
        }

        if (filters.tag && !record.tags.includes(filters.tag)) {
          return false;
        }

        return true;
      });

    return { items, total: items.length };
  }

  getTrending(limit = 6): MCPServerRecord[] {
    const rows = this.db.prepare(`
      SELECT *
      FROM registry_servers
      ORDER BY verified DESC, downloads DESC, rating DESC, name ASC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.toRecord(row));
  }

  listTags(): string[] {
    const rows = this.db.prepare("SELECT tags_json FROM registry_servers").all() as Array<Record<string, unknown>>;
    return [...new Set(rows.flatMap((row) => JSON.parse(String(row["tags_json"])) as string[]))]
      .sort((left, right) => left.localeCompare(right));
  }

  getStats(): { total: number; verified: number; tags: number } {
    const total = this.db.prepare("SELECT COUNT(*) AS count FROM registry_servers").get() as { count: number };
    const verified = this.db.prepare("SELECT COUNT(*) AS count FROM registry_servers WHERE verified = 1").get() as { count: number };
    return {
      total: total.count,
      verified: verified.count,
      tags: this.listTags().length,
    };
  }

  update(id: string, patch: Partial<MCPServerRecord>): MCPServerRecord {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Server "${id}" not found`);
    }

    const updated: MCPServerRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      updatedAt: new Date(),
    };

    this.db.prepare(`
      UPDATE registry_servers
      SET name = ?, package_name = ?, version = ?, description = ?, author = ?, transport_json = ?, tags_json = ?,
          install_command = ?, config_schema_json = ?, homepage = ?, license = ?, verified = ?, downloads = ?,
          rating = ?, updated_at = ?
      WHERE id = ?
    `).run(
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
      updated.license,
      updated.verified ? 1 : 0,
      updated.downloads,
      updated.rating,
      updated.updatedAt.toISOString(),
      updated.id,
    );

    return {
      ...updated,
      qualityScore: this.computeQualityScore(updated),
    };
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM registry_servers WHERE id = ?").run(id);
  }

  seed(servers: MCPServerRecord[]): void {
    for (const server of servers) {
      const existing = this.db.prepare("SELECT id FROM registry_servers WHERE id = ? LIMIT 1").get(server.id);
      if (existing) {
        continue;
      }

      this.db.prepare(`
        INSERT INTO registry_servers (
          id, name, package_name, version, description, author, transport_json, tags_json,
          install_command, config_schema_json, homepage, license, verified, downloads, rating, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        server.id,
        server.name,
        server.packageName,
        server.version,
        server.description,
        server.author,
        JSON.stringify(server.transport),
        JSON.stringify(server.tags),
        server.installCommand,
        server.configSchema ? JSON.stringify(server.configSchema) : null,
        server.homepage ?? null,
        server.license,
        server.verified ? 1 : 0,
        server.downloads,
        server.rating,
        server.createdAt.toISOString(),
        server.updatedAt.toISOString(),
      );
    }
  }

  private toRecord(row: Record<string, unknown>): MCPServerRecord {
    const configSchema = typeof row["config_schema_json"] === "string"
      ? JSON.parse(row["config_schema_json"]) as JSONSchema7
      : undefined;
    const homepage = typeof row["homepage"] === "string" ? row["homepage"] : undefined;

    const record: MCPServerRecord = {
      id: String(row["id"]),
      name: String(row["name"]),
      packageName: String(row["package_name"]),
      version: String(row["version"]),
      description: String(row["description"]),
      author: String(row["author"]),
      transport: JSON.parse(String(row["transport_json"])) as Array<"stdio" | "http">,
      tags: JSON.parse(String(row["tags_json"])) as string[],
      installCommand: String(row["install_command"]),
      ...(configSchema ? { configSchema } : {}),
      ...(homepage ? { homepage } : {}),
      license: String(row["license"]),
      verified: Number(row["verified"]) === 1,
      downloads: Number(row["downloads"]),
      rating: Number(row["rating"]),
      createdAt: new Date(String(row["created_at"])),
      updatedAt: new Date(String(row["updated_at"])),
    };

    return {
      ...record,
      qualityScore: this.computeQualityScore(record),
    };
  }

  private computeQualityScore(record: MCPServerRecord): number {
    const verifiedWeight = record.verified ? 25 : 0;
    const downloadWeight = Math.min(45, Math.round(record.downloads / 4_000));
    const ratingWeight = Math.round((record.rating / 5) * 30);
    return Math.min(100, verifiedWeight + downloadWeight + ratingWeight);
  }
}
