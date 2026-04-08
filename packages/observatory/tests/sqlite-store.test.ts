import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SQLiteStore } from "../src/storage/SQLiteStore.js";

describe("SQLiteStore", () => {
  it("stores and queries spans, metrics, alerts, and derived rollups", () => {
    const store = new SQLiteStore(new Database(":memory:"));

    store.insertSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "tool.call",
      startTime: new Date(Date.now() - 5_000).toISOString(),
      endTime: new Date().toISOString(),
      attributes: { tool: "search" },
    });

    const now = Date.now();
    for (const value of [100, 110, 120, 130, 140, 1000]) {
      store.insertMetric({
        name: "latency",
        value,
        timestamp: new Date(now - 60_000).toISOString(),
        toolName: "search",
      });
    }
    store.insertMetric({ name: "calls", value: 1, timestamp: new Date(now - 30_000).toISOString(), toolName: "search" });
    store.insertMetric({ name: "calls", value: 1, timestamp: new Date(now - 20_000).toISOString(), toolName: "search" });
    store.insertMetric({ name: "errors", value: 1, timestamp: new Date(now - 10_000).toISOString(), toolName: "search" });

    store.insertAlert({
      id: "alert-1",
      severity: "warning",
      title: "Latency spike",
      message: "p99 exceeded baseline",
      metric: "latency",
      createdAt: new Date(now).toISOString(),
    });

    expect(store.querySpans({ traceId: "trace-1" })).toEqual([
      expect.objectContaining({ name: "tool.call", attributes: { tool: "search" } }),
    ]);
    expect(store.queryMetrics("latency", new Date(now - 3600_000), new Date(now + 1000))).toHaveLength(6);
    expect(store.listAlerts()).toEqual([
      expect.objectContaining({ id: "alert-1", severity: "warning" }),
    ]);
    expect(store.getP99Latency("*", 60)).toBe(1000);
    expect(store.getErrorRate("*", 60)).toBe(0.5);
    expect(store.getCallVolume("*", 60)).toBe(2);
    expect(store.computeBaseline("latency", 7)).toMatchObject({
      mean: expect.any(Number),
      p95: 1000,
      p99: 1000,
    });
    expect(store.getCounts()).toEqual({ metrics: 9, spans: 1, alerts: 1 });
  });
});
