import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardServer } from "../../packages/observatory/src/server/DashboardServer.js";
import { SQLiteStore } from "../../packages/observatory/src/storage/SQLiteStore.js";

describe("Observatory API integration", () => {
  let server: DashboardServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("serves dashboard, metrics, traces, anomalies, alerts, and health endpoints over HTTP", async () => {
    const store = new SQLiteStore(new Database(":memory:"));
    const now = Date.now();
    store.insertSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "tool.call",
      startTime: new Date(now - 2_000).toISOString(),
      endTime: new Date(now - 1_000).toISOString(),
      attributes: { tool: "search" },
    });

    for (const value of [100, 110, 125, 140, 150, 950]) {
      store.insertMetric({
        name: "latency",
        value,
        timestamp: new Date(now - 10_000).toISOString(),
        toolName: "search",
      });
    }
    store.insertMetric({ name: "calls", value: 1, timestamp: new Date(now - 9_000).toISOString(), toolName: "search" });
    store.insertMetric({ name: "errors", value: 1, timestamp: new Date(now - 8_000).toISOString(), toolName: "search" });
    store.insertAlert({
      id: "alert-1",
      severity: "warning",
      title: "Latency alert",
      message: "p99 latency breached threshold",
      metric: "latency",
      createdAt: new Date(now - 5_000).toISOString(),
    });

    server = new DashboardServer(store);
    const port = await server.listen(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const dashboard = await fetch(`${baseUrl}/api/dashboard`).then(
      (response) =>
        response.json() as Promise<{ p99Latency: number; errorRate: number; callVolume: number }>,
    );
    expect(dashboard).toMatchObject({
      p99Latency: 950,
      errorRate: 1,
      callVolume: 1,
    });

    const metrics = await fetch(`${baseUrl}/api/metrics?name=latency&minutes=60`).then(
      (response) => response.json() as Promise<{ items: unknown[] }>,
    );
    expect(metrics.items).toHaveLength(6);

    const traces = await fetch(`${baseUrl}/api/traces?limit=10`).then(
      (response) => response.json() as Promise<{ items: Array<{ traceId: string }> }>,
    );
    expect(traces.items).toEqual([expect.objectContaining({ traceId: "trace-1" })]);

    const anomalies = await fetch(`${baseUrl}/api/anomalies`).then(
      (response) => response.json() as Promise<{ items: Array<{ title: string }> }>,
    );
    expect(anomalies.items[0]).toMatchObject({
      title: "Latency spike detected",
    });

    const alerts = await fetch(`${baseUrl}/api/alerts?limit=10`).then(
      (response) => response.json() as Promise<{ items: Array<{ id: string }> }>,
    );
    expect(alerts.items[0]).toMatchObject({
      id: "alert-1",
    });

    const health = await fetch(`${baseUrl}/health`).then(
      (response) => response.json() as Promise<{ status: string; metrics: number; spans: number }>,
    );
    expect(health).toMatchObject({
      status: "ok",
      metrics: 8,
      spans: 1,
    });
  });
});
