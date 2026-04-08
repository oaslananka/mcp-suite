import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { ToolCallResult } from "@oaslananka/shared";

export interface ToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface VirtualKey {
  id: string;
  name: string;
  tags: string[];
  createdAt: Date;
  expiresAt?: Date;
  rateLimit?: { requestsPerMinute: number };
  allowedTools?: string[];
  rawKey?: string;
  isRevoked: boolean;
}

export interface CreateKeyOptions {
  name: string;
  tags?: string[];
  expiresAt?: Date;
  rateLimit?: { requestsPerMinute: number };
  allowedTools?: string[];
}

export type SentinelToolCallResult = ToolCallResult;

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export class KeyManager {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS virtual_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        raw_key_hash TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        rate_limit_rpm INTEGER,
        allowed_tools TEXT,
        is_revoked INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  create(opts: CreateKeyOptions): VirtualKey {
    const id = randomBytes(8).toString("hex");
    const rawKey = `mcp_${randomBytes(24).toString("hex")}`;
    const key: VirtualKey = {
      id,
      name: opts.name,
      tags: opts.tags ?? [],
      createdAt: new Date(),
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
      ...(opts.rateLimit ? { rateLimit: opts.rateLimit } : {}),
      ...(opts.allowedTools ? { allowedTools: opts.allowedTools } : {}),
      rawKey,
      isRevoked: false
    };

    this.db
      .prepare(`
        INSERT INTO virtual_keys (
          id, name, raw_key_hash, tags, created_at, expires_at, rate_limit_rpm, allowed_tools, is_revoked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        key.id,
        key.name,
        hashKey(rawKey),
        JSON.stringify(key.tags),
        key.createdAt.toISOString(),
        key.expiresAt?.toISOString() ?? null,
        key.rateLimit?.requestsPerMinute ?? null,
        JSON.stringify(key.allowedTools ?? []),
        0
      );

    return key;
  }

  revoke(id: string): void {
    this.db.prepare("UPDATE virtual_keys SET is_revoked = 1 WHERE id = ?").run(id);
  }

  list(): VirtualKey[] {
    const rows = this.db.prepare("SELECT * FROM virtual_keys ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.toVirtualKey(row));
  }

  validate(rawKey: string): VirtualKey | null {
    const row = this.db
      .prepare("SELECT * FROM virtual_keys WHERE raw_key_hash = ? LIMIT 1")
      .get(hashKey(rawKey)) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    const key = this.toVirtualKey(row);
    if (key.isRevoked) {
      return null;
    }

    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return key;
  }

  rotate(id: string): { oldKey: VirtualKey; newKey: VirtualKey } {
    const existing = this.db.prepare("SELECT * FROM virtual_keys WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Virtual key "${id}" not found`);
    }

    const oldKey = this.toVirtualKey(existing);
    this.revoke(id);
    const newKey = this.create({
      name: oldKey.name,
      tags: oldKey.tags,
      ...(oldKey.expiresAt ? { expiresAt: oldKey.expiresAt } : {}),
      ...(oldKey.rateLimit ? { rateLimit: oldKey.rateLimit } : {}),
      ...(oldKey.allowedTools ? { allowedTools: oldKey.allowedTools } : {})
    });

    return { oldKey, newKey };
  }

  private toVirtualKey(row: Record<string, unknown>): VirtualKey {
    const rpm = row["rate_limit_rpm"];
    const expiresAt = typeof row["expires_at"] === "string" ? new Date(row["expires_at"]) : undefined;
    const allowedTools = typeof row["allowed_tools"] === "string" ? JSON.parse(row["allowed_tools"]) as string[] : [];
    const tags = typeof row["tags"] === "string" ? JSON.parse(row["tags"]) as string[] : [];

    return {
      id: String(row["id"]),
      name: String(row["name"]),
      tags,
      createdAt: new Date(String(row["created_at"])),
      ...(expiresAt ? { expiresAt } : {}),
      ...(typeof rpm === "number" ? { rateLimit: { requestsPerMinute: rpm } } : {}),
      ...(allowedTools.length > 0 ? { allowedTools } : {}),
      isRevoked: Boolean(row["is_revoked"])
    };
  }
}
