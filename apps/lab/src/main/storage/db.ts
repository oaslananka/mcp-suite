import Database from "better-sqlite3";

export interface ConnectionRecord {
  id: string;
  name: string;
  type: "stdio" | "http";
  endpoint: string;
  command: string | undefined;
  args: string[];
  favorite: boolean;
  createdAt: string;
}

export interface ToolCallRecord {
  connectionId: string;
  toolName: string;
  input: string;
  output: string;
  latencyMs: number;
  isError: boolean;
}

export interface ToolCallHistoryRecord extends ToolCallRecord {
  id: number;
  createdAt: string;
}

export class LabDatabase {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        command TEXT,
        args_json TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        is_error INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  saveConnection(record: Omit<ConnectionRecord, "createdAt">): ConnectionRecord {
    const argsJson = JSON.stringify(record.args);
    this.db
      .prepare(
        `
      INSERT INTO connections (id, name, type, endpoint, command, args_json, favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        endpoint = excluded.endpoint,
        command = excluded.command,
        args_json = excluded.args_json,
        favorite = excluded.favorite
    `
      )
      .run(
        record.id,
        record.name,
        record.type,
        record.endpoint,
        record.command ?? null,
        argsJson,
        record.favorite ? 1 : 0
      );

    const saved = this.findConnection(record.id);
    if (!saved) {
      throw new Error(`Failed to load saved connection ${record.id}`);
    }
    return saved;
  }

  listConnections(): ConnectionRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, name, type, endpoint, command, args_json, favorite, created_at
      FROM connections
      ORDER BY favorite DESC, created_at DESC
    `
      )
      .all() as Array<{
      id: string;
      name: string;
      type: "stdio" | "http";
      endpoint: string;
      command: string | null;
      args_json: string;
      favorite: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      endpoint: row.endpoint,
      command: row.command ?? undefined,
      args: this.parseArgs(row.args_json),
      favorite: row.favorite === 1,
      createdAt: row.created_at,
    }));
  }

  setFavoriteConnection(id: string, favorite: boolean): ConnectionRecord | null {
    const result = this.db
      .prepare(
        `
      UPDATE connections
      SET favorite = ?
      WHERE id = ?
    `
      )
      .run(favorite ? 1 : 0, id);

    if (result.changes === 0) {
      return null;
    }

    return this.findConnection(id);
  }

  deleteConnection(id: string): boolean {
    const result = this.db
      .prepare(
        `
      DELETE FROM connections
      WHERE id = ?
    `
      )
      .run(id);

    return result.changes > 0;
  }

  deleteAllConnections(): number {
    const result = this.db
      .prepare(
        `
      DELETE FROM connections
    `
      )
      .run();

    return result.changes;
  }

  findConnection(id: string): ConnectionRecord | null {
    const row = this.db
      .prepare(
        `
      SELECT id, name, type, endpoint, command, args_json, favorite, created_at
      FROM connections
      WHERE id = ?
    `
      )
      .get(id) as
      | {
          id: string;
          name: string;
          type: "stdio" | "http";
          endpoint: string;
          command: string | null;
          args_json: string;
          favorite: number;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      endpoint: row.endpoint,
      command: row.command ?? undefined,
      args: this.parseArgs(row.args_json),
      favorite: row.favorite === 1,
      createdAt: row.created_at,
    };
  }

  recordToolCall(record: ToolCallRecord): void {
    this.db
      .prepare(
        `
      INSERT INTO tool_calls (connection_id, tool_name, input_json, output_json, latency_ms, is_error)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        record.connectionId,
        record.toolName,
        record.input,
        record.output,
        record.latencyMs,
        record.isError ? 1 : 0
      );
  }

  listToolCalls(limit = 100): ToolCallHistoryRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, connection_id, tool_name, input_json, output_json, latency_ms, is_error, created_at
      FROM tool_calls
      ORDER BY id DESC
      LIMIT ?
    `
      )
      .all(limit) as Array<{
      id: number;
      connection_id: string;
      tool_name: string;
      input_json: string;
      output_json: string;
      latency_ms: number;
      is_error: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      connectionId: row.connection_id,
      toolName: row.tool_name,
      input: row.input_json,
      output: row.output_json,
      latencyMs: row.latency_ms,
      isError: row.is_error === 1,
      createdAt: row.created_at,
    }));
  }

  listCollections(): string[] {
    return ["connections", "tool_calls"];
  }

  close(): void {
    this.db.close();
  }

  private parseArgs(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  }
}
