import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard.js";
import { Traces } from "./pages/Traces.js";
import { Anomalies } from "./pages/Anomalies.js";

interface MetricPoint {
  name: string;
  value: number;
  timestamp: string;
}

interface TraceRecord {
  traceId: string;
  spanId: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface AlertLike {
  id: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
}

function navigate(pathname: string): void {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function App(): JSX.Element {
  const [path, setPath] = useState(window.location.pathname);
  const [summary, setSummary] = useState<{
    p99Latency: number;
    errorRate: number;
    callVolume: number;
    errorBudget: { status: string; budgetRemaining: number };
  } | null>(null);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AlertLike[]>([]);
  const [alerts, setAlerts] = useState<AlertLike[]>([]);

  useEffect(() => {
    const onPopState = (): void => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    void fetchJson("/api/dashboard").then((data) => setSummary(data as typeof summary));
    void fetchJson<{ items: MetricPoint[] }>("/api/metrics?name=latency&minutes=60").then((data) => setMetrics(data.items));
    void fetchJson<{ items: TraceRecord[] }>("/api/traces?limit=25").then((data) => setTraces(data.items));
    void fetchJson<{ items: AlertLike[] }>("/api/anomalies").then((data) => setAnomalies(data.items));
    void fetchJson<{ items: AlertLike[] }>("/api/alerts").then((data) => setAlerts(data.items));
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Observability for MCP</p>
          <h1>Track latency, traces, and error budget from one focused control room.</h1>
          <p className="lede">
            Observatory packages operational insight for MCP workloads with dashboard summaries, trace views,
            anomaly detection, and alert history.
          </p>
        </div>
        <nav className="tab-row">
          <button type="button" className={path === "/" ? "tab active" : "tab"} onClick={() => navigate("/")}>
            Dashboard
          </button>
          <button type="button" className={path === "/traces" ? "tab active" : "tab"} onClick={() => navigate("/traces")}>
            Traces
          </button>
          <button type="button" className={path === "/anomalies" ? "tab active" : "tab"} onClick={() => navigate("/anomalies")}>
            Anomalies
          </button>
        </nav>
      </section>

      {path === "/traces" ? <Traces traces={traces} /> : null}
      {path === "/anomalies" ? <Anomalies anomalies={anomalies} alerts={alerts} /> : null}
      {path === "/" ? <Dashboard summary={summary} latencySeries={metrics.map((metric) => ({ timestamp: metric.timestamp, value: metric.value }))} /> : null}
    </main>
  );
}
