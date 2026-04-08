import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DashboardProps {
  summary: {
    p99Latency: number;
    errorRate: number;
    callVolume: number;
    errorBudget: { status: string; budgetRemaining: number };
  } | null;
  latencySeries: Array<{ timestamp: string; value: number }>;
}

export function Dashboard({ summary, latencySeries }: DashboardProps): JSX.Element {
  return (
    <section className="page-grid">
      <div className="metric-strip">
        <article className="metric-card">
          <span>P99 latency</span>
          <strong>{summary ? `${summary.p99Latency.toFixed(0)}ms` : "--"}</strong>
        </article>
        <article className="metric-card">
          <span>Error rate</span>
          <strong>{summary ? `${(summary.errorRate * 100).toFixed(2)}%` : "--"}</strong>
        </article>
        <article className="metric-card">
          <span>Call volume</span>
          <strong>{summary ? summary.callVolume.toLocaleString() : "--"}</strong>
        </article>
        <article className="metric-card">
          <span>Error budget</span>
          <strong>{summary ? `${summary.errorBudget.status} / ${summary.errorBudget.budgetRemaining}` : "--"}</strong>
        </article>
      </div>

      <article className="chart-card">
        <div>
          <p className="eyebrow">Latency curve</p>
          <h2>Last 60 minutes</h2>
        </div>
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={latencySeries}>
              <defs>
                <linearGradient id="latencyFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#e45b2e" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#e45b2e" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" tickFormatter={(value) => value.slice(11, 16)} stroke="#6e675c" />
              <YAxis stroke="#6e675c" />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#b63f1d" fill="url(#latencyFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
