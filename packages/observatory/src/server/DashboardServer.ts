import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { ErrorBudget } from "../slo/ErrorBudget.js";
import { SQLiteStore } from "../storage/SQLiteStore.js";

function resolveUiDistDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/ui"),
    path.resolve(process.cwd(), "packages/observatory/dist/ui"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? path.resolve(process.cwd(), "dist/ui");
}

export class DashboardServer {
  private httpServer: Server | undefined;

  constructor(private readonly store: SQLiteStore) {}

  listen(port = 4318): Promise<number> {
    if (this.httpServer?.listening) {
      return Promise.resolve(this.getPort() ?? port);
    }

    this.httpServer = createServer((req, res) => {
      void this.handle(req, res);
    });

    return new Promise((resolve, reject) => {
      const server = this.httpServer;
      if (!server) {
        reject(new Error("Dashboard server failed to initialize"));
        return;
      }

      const onError = (error: Error): void => reject(error);
      server.once("error", onError);
      server.listen(port, () => {
        server.off("error", onError);
        resolve(this.getPort() ?? port);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.httpServer) {
      return;
    }

    const server = this.httpServer;
    this.httpServer = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  getPort(): number | undefined {
    const address = this.httpServer?.address();
    return typeof address === "object" && address ? address.port : undefined;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const errorBudget = new ErrorBudget().calculate(
        { name: "availability", type: "availability", target: 99.9, window: "30d" },
        100 - this.store.getErrorRate("*", 60) * 100,
      );

      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        p99Latency: this.store.getP99Latency("*", 60),
        errorRate: this.store.getErrorRate("*", 60),
        callVolume: this.store.getCallVolume("*", 60),
        errorBudget,
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/metrics") {
      const name = url.searchParams.get("name") ?? "latency";
      const minutes = Number(url.searchParams.get("minutes") ?? "60");
      const metrics = this.store.queryMetrics(name, new Date(Date.now() - minutes * 60_000), new Date());
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ items: metrics }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/traces") {
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const traceId = url.searchParams.get("traceId") ?? undefined;
      const traces = this.store.querySpans({
        limit,
        ...(traceId ? { traceId } : {}),
      });
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ items: traces }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/anomalies") {
      const anomalies = this.detectAnomalies();
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ items: anomalies }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/alerts") {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const storedAlerts = this.store.listAlerts(limit);
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ items: storedAlerts.length > 0 ? storedAlerts : this.detectAnomalies() }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        status: "ok",
        ...this.store.getCounts(),
      }));
      return;
    }

    await this.serveUi(url.pathname, res);
  }

  private detectAnomalies(): Array<Record<string, unknown>> {
    const currentP99 = this.store.getP99Latency("*", 60);
    const baseline = this.store.computeBaseline("latency", 7);
    const threshold = baseline.mean + baseline.stddev * 2;

    if (currentP99 <= threshold || currentP99 === 0) {
      return [];
    }

    return [
      {
        id: `latency-${Date.now()}`,
        severity: currentP99 > threshold * 1.25 ? "critical" : "warning",
        title: "Latency spike detected",
        message: `Observed p99 latency ${currentP99.toFixed(0)}ms against an expected baseline of ${baseline.mean.toFixed(0)}ms.`,
        metric: "latency",
        actualValue: currentP99,
        expectedValue: baseline.mean,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private async serveUi(pathname: string, res: ServerResponse): Promise<void> {
    const uiDistDir = resolveUiDistDir();

    if (!existsSync(uiDistDir)) {
      res.writeHead(404).end("Observatory UI has not been built yet");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const assetPath = path.resolve(uiDistDir, relativePath);
    const isSafePath = assetPath.startsWith(uiDistDir);

    if (isSafePath && existsSync(assetPath)) {
      const body = await readFile(assetPath);
      res.writeHead(200, { "content-type": this.getContentType(assetPath) });
      res.end(body);
      return;
    }

    const indexHtml = await readFile(path.join(uiDistDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(indexHtml);
  }

  private getContentType(assetPath: string): string {
    if (assetPath.endsWith(".js")) {
      return "text/javascript; charset=utf-8";
    }
    if (assetPath.endsWith(".css")) {
      return "text/css; charset=utf-8";
    }
    if (assetPath.endsWith(".json")) {
      return "application/json; charset=utf-8";
    }

    return "text/html; charset=utf-8";
  }
}
