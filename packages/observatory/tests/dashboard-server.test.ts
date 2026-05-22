import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { DashboardServer } from "../src/server/DashboardServer.js";
import { SQLiteStore } from "../src/storage/SQLiteStore.js";

function createResponseCollector(): {
  res: {
    setHeader: (name: string, value: string) => void;
    writeHead: (statusCode: number, headers?: Record<string, string>) => void;
    end: (body?: string | Buffer) => void;
  };
  result: () => { statusCode: number; headers: Record<string, string>; body: string };
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  return {
    res: {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      writeHead(nextStatusCode, nextHeaders) {
        statusCode = nextStatusCode;
        if (nextHeaders) {
          Object.assign(
            headers,
            Object.fromEntries(
              Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
            )
          );
        }
      },
      end(chunk) {
        body = chunk ? chunk.toString() : "";
      },
    },
    result: () => ({ statusCode, headers, body }),
  };
}

describe("DashboardServer", () => {
  it("serves dashboard, traces, anomalies, alerts, and health endpoints", async () => {
    const store = new SQLiteStore(new Database(":memory:"));
    const now = Date.now();

    store.insertSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "tool.call",
      startTime: new Date(now - 2_000).toISOString(),
      endTime: new Date(now - 1_000).toISOString(),
    });

    for (const value of [100, 110, 115, 120, 125, 900]) {
      store.insertMetric({
        name: "latency",
        value,
        timestamp: new Date(now - 10_000).toISOString(),
        toolName: "search",
      });
    }
    store.insertMetric({
      name: "calls",
      value: 1,
      timestamp: new Date(now - 9_000).toISOString(),
      toolName: "search",
    });
    store.insertMetric({
      name: "errors",
      value: 1,
      timestamp: new Date(now - 8_000).toISOString(),
      toolName: "search",
    });

    const server = new DashboardServer(store);

    const dashboardResponse = createResponseCollector();
    await (server as any).handle({ method: "GET", url: "/api/dashboard" }, dashboardResponse.res);
    expect(JSON.parse(dashboardResponse.result().body)).toMatchObject({
      p99Latency: 900,
      errorRate: 1,
      callVolume: 1,
      errorBudget: expect.any(Object),
    });

    const metricsResponse = createResponseCollector();
    await (server as any).handle(
      { method: "GET", url: "/api/metrics?name=latency&minutes=60" },
      metricsResponse.res
    );
    expect(JSON.parse(metricsResponse.result().body).items).toHaveLength(6);

    const tracesResponse = createResponseCollector();
    await (server as any).handle(
      { method: "GET", url: "/api/traces?limit=10" },
      tracesResponse.res
    );
    expect(JSON.parse(tracesResponse.result().body).items).toHaveLength(1);

    const anomaliesResponse = createResponseCollector();
    await (server as any).handle({ method: "GET", url: "/api/anomalies" }, anomaliesResponse.res);
    expect(JSON.parse(anomaliesResponse.result().body).items[0]).toMatchObject({
      title: "Latency spike detected",
      metric: "latency",
    });

    const alertsResponse = createResponseCollector();
    await (server as any).handle(
      { method: "GET", url: "/api/alerts?limit=10" },
      alertsResponse.res
    );
    expect(JSON.parse(alertsResponse.result().body).items.length).toBeGreaterThan(0);

    const healthResponse = createResponseCollector();
    await (server as any).handle({ method: "GET", url: "/health" }, healthResponse.res);
    expect(JSON.parse(healthResponse.result().body)).toMatchObject({
      status: "ok",
      metrics: 8,
      spans: 1,
    });
  });

  it("does not serve sibling-prefix traversal paths outside the UI bundle", async () => {
    const previousCwd = process.cwd();
    const rootDir = await mkdtemp(path.join(tmpdir(), "observatory-ui-"));
    const uiDir = path.join(rootDir, "dist", "ui");
    const siblingDir = path.join(rootDir, "dist", "ui-evil");
    await mkdir(uiDir, { recursive: true });
    await mkdir(siblingDir, { recursive: true });
    await writeFile(
      path.join(uiDir, "index.html"),
      "<html><body>Observatory UI</body></html>",
      "utf8"
    );
    await writeFile(path.join(siblingDir, "secret.txt"), "sibling secret", "utf8");
    await mkdir(path.join(uiDir, "assets"), { recursive: true });
    process.chdir(rootDir);

    try {
      const store = new SQLiteStore(new Database(":memory:"));
      const server = new DashboardServer(store);

      const response = createResponseCollector();
      await (
        server as unknown as {
          serveUi: (
            pathname: string,
            res: ReturnType<typeof createResponseCollector>["res"]
          ) => Promise<void>;
        }
      ).serveUi("../ui-evil/secret.txt", response.res);

      expect(response.result().statusCode).toBe(200);
      expect(response.result().body).toContain("Observatory UI");
      expect(response.result().body).not.toContain("sibling secret");

      const directoryResponse = createResponseCollector();
      await (
        server as unknown as {
          serveUi: (
            pathname: string,
            res: ReturnType<typeof createResponseCollector>["res"]
          ) => Promise<void>;
        }
      ).serveUi("/assets", directoryResponse.res);

      expect(directoryResponse.result().statusCode).toBe(200);
      expect(directoryResponse.result().body).toContain("Observatory UI");
    } finally {
      process.chdir(previousCwd);
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
