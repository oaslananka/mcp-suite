import Database from "better-sqlite3";
import { BaselineStats } from "../anomaly/AnomalyDetector.js";

export interface SpanData {
  traceId: string;
  spanId: string;
  name: string;
  startTime: string;
  endTime: string;
  attributes?: Record<string, unknown>;
}

export interface SpanFilter {
  traceId?: string;
  name?: string;
  limit?: number;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;
  toolName?: string;
}

export interface AlertRecord {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metric: string;
  createdAt: string;
}

export class SQLiteStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        attributes_json TEXT,
        PRIMARY KEY (trace_id, span_id)
      );
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp TEXT NOT NULL,
        tool_name TEXT
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        metric TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  insertSpan(span: SpanData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO spans (trace_id, span_id, name, start_time, end_time, attributes_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      span.traceId,
      span.spanId,
      span.name,
      span.startTime,
      span.endTime,
      span.attributes ? JSON.stringify(span.attributes) : null,
    );
  }

  querySpans(filters: SpanFilter = {}): SpanData[] {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filters.traceId) {
      clauses.push("trace_id = ?");
      values.push(filters.traceId);
    }
    if (filters.name) {
      clauses.push("name = ?");
      values.push(filters.name);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filters.limit ? `LIMIT ${filters.limit}` : "";
    const rows = this.db.prepare(`SELECT * FROM spans ${where} ORDER BY start_time DESC ${limit}`).all(...values) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const attributes = typeof row["attributes_json"] === "string"
        ? JSON.parse(row["attributes_json"]) as Record<string, unknown>
        : undefined;

      return {
        traceId: String(row["trace_id"]),
        spanId: String(row["span_id"]),
        name: String(row["name"]),
        startTime: String(row["start_time"]),
        endTime: String(row["end_time"]),
        ...(attributes ? { attributes } : {}),
      };
    });
  }

  insertMetric(metric: MetricPoint): void {
    this.db.prepare(`
      INSERT INTO metrics (name, value, timestamp, tool_name)
      VALUES (?, ?, ?, ?)
    `).run(metric.name, metric.value, metric.timestamp, metric.toolName ?? null);
  }

  queryMetrics(name: string, from: Date, to: Date): MetricPoint[] {
    const rows = this.db.prepare(`
      SELECT name, value, timestamp, tool_name
      FROM metrics
      WHERE name = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(name, from.toISOString(), to.toISOString()) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const toolName = typeof row["tool_name"] === "string" ? row["tool_name"] : undefined;
      return {
        name: String(row["name"]),
        value: Number(row["value"]),
        timestamp: String(row["timestamp"]),
        ...(toolName ? { toolName } : {}),
      };
    });
  }

  insertAlert(alert: AlertRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO alerts (id, severity, title, message, metric, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(alert.id, alert.severity, alert.title, alert.message, alert.metric, alert.createdAt);
  }

  listAlerts(limit = 20): AlertRecord[] {
    const rows = this.db.prepare(`
      SELECT id, severity, title, message, metric, created_at
      FROM alerts
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row["id"]),
      severity: String(row["severity"]) as AlertRecord["severity"],
      title: String(row["title"]),
      message: String(row["message"]),
      metric: String(row["metric"]),
      createdAt: String(row["created_at"]),
    }));
  }

  getP99Latency(toolName: string, windowMinutes: number): number {
    const from = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const rows = this.db.prepare(`
      SELECT value FROM metrics
      WHERE name = 'latency' AND timestamp >= ? AND (? = '*' OR tool_name = ?)
      ORDER BY value ASC
    `).all(from, toolName, toolName) as Array<{ value: number }>;

    if (rows.length === 0) {
      return 0;
    }

    const index = Math.max(0, Math.ceil(rows.length * 0.99) - 1);
    return Number(rows[index]?.value ?? 0);
  }

  getErrorRate(toolName: string, windowMinutes: number): number {
    const from = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM metrics
      WHERE name = 'calls' AND timestamp >= ? AND (? = '*' OR tool_name = ?)
    `).get(from, toolName, toolName) as { count: number };
    const errorRow = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM metrics
      WHERE name = 'errors' AND timestamp >= ? AND (? = '*' OR tool_name = ?)
    `).get(from, toolName, toolName) as { count: number };

    if (!totalRow.count) {
      return 0;
    }

    return errorRow.count / totalRow.count;
  }

  getCallVolume(toolName: string, windowMinutes: number): number {
    const from = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM metrics
      WHERE name = 'calls' AND timestamp >= ? AND (? = '*' OR tool_name = ?)
    `).get(from, toolName, toolName) as { count: number };
    return row.count;
  }

  computeBaseline(metric: string, windowDays: number): BaselineStats {
    const from = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db.prepare(`
      SELECT value FROM metrics
      WHERE name = ? AND timestamp >= ?
      ORDER BY value ASC
    `).all(metric, from) as Array<{ value: number }>;

    if (rows.length === 0) {
      return { mean: 0, stddev: 0, p50: 0, p95: 0, p99: 0 };
    }

    const values = rows.map((row) => row.value).sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

    const percentile = (ratio: number): number => {
      const index = Math.max(0, Math.ceil(values.length * ratio) - 1);
      return values[index] ?? 0;
    };

    return {
      mean,
      stddev: Math.sqrt(variance),
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  }

  getCounts(): { metrics: number; spans: number; alerts: number } {
    const metrics = this.db.prepare("SELECT COUNT(*) AS count FROM metrics").get() as { count: number };
    const spans = this.db.prepare("SELECT COUNT(*) AS count FROM spans").get() as { count: number };
    const alerts = this.db.prepare("SELECT COUNT(*) AS count FROM alerts").get() as { count: number };
    return { metrics: metrics.count, spans: spans.count, alerts: alerts.count };
  }
}
