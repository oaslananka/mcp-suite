interface AlertLike {
  id: string;
  severity: string;
  title: string;
  message: string;
  createdAt: string;
}

export function Anomalies({ anomalies, alerts }: { anomalies: AlertLike[]; alerts: AlertLike[] }): JSX.Element {
  return (
    <section className="page-grid twin">
      <article className="list-card">
        <div>
          <p className="eyebrow">Anomalies</p>
          <h2>Signal spikes</h2>
        </div>
        {anomalies.length === 0 ? <p className="muted">No active anomalies detected.</p> : null}
        {anomalies.map((anomaly) => (
          <div key={anomaly.id} className={`alert-card severity-${anomaly.severity}`}>
            <strong>{anomaly.title}</strong>
            <p>{anomaly.message}</p>
            <span>{anomaly.createdAt}</span>
          </div>
        ))}
      </article>

      <article className="list-card">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>Recent notifications</h2>
        </div>
        {alerts.length === 0 ? <p className="muted">No alerts have been raised yet.</p> : null}
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-card severity-${alert.severity}`}>
            <strong>{alert.title}</strong>
            <p>{alert.message}</p>
            <span>{alert.createdAt}</span>
          </div>
        ))}
      </article>
    </section>
  );
}
