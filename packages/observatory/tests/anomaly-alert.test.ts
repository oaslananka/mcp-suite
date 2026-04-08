import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertManager } from "../src/alerts/AlertManager.js";
import { AnomalyDetector } from "../src/anomaly/AnomalyDetector.js";
import { SQLiteStore } from "../src/storage/SQLiteStore.js";

describe("AlertManager and AnomalyDetector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("deduplicates alerts within the cool-down window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00Z"));

    const send = vi.fn(async () => undefined);
    const manager = new AlertManager();
    manager.addChannel({
      name: "webhook",
      type: "webhook",
      config: {},
      send,
    });

    const anomaly = {
      metric: "latency",
      actualValue: 900,
      expectedValue: 100,
      zScore: 4.5,
      serverName: "atlas",
      toolName: "search",
      timestamp: new Date(),
    };

    await manager.trigger(anomaly);
    await manager.trigger(anomaly);
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000);
    await manager.trigger(anomaly);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("detects latency anomalies and emits alerts through the alert manager", async () => {
    const store = new SQLiteStore(new Database(":memory:"));
    const now = Date.now();

    for (const value of [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 3000]) {
      store.insertMetric({
        name: "latency",
        value,
        timestamp: new Date(now - 30_000).toISOString(),
      });
    }

    const triggered: unknown[] = [];
    const alertManager = {
      trigger: vi.fn(async (anomaly) => {
        triggered.push(anomaly);
      }),
    } as unknown as AlertManager;

    const detector = new AnomalyDetector();
    await (detector as any).check(store, alertManager);

    expect(triggered[0]).toMatchObject({
      metric: "latency",
      actualValue: 3000,
      expectedValue: expect.any(Number),
    });

    expect((detector as any).detectAnomaly(50, {
      mean: 100,
      stddev: 20,
      p50: 100,
      p95: 120,
      p99: 130,
    })).toBeNull();
  });
});
