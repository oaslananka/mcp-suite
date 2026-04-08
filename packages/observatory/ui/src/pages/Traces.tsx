interface TraceRecord {
  traceId: string;
  spanId: string;
  name: string;
  startTime: string;
  endTime: string;
}

export function Traces({ traces }: { traces: TraceRecord[] }): JSX.Element {
  return (
    <section className="page-grid">
      <article className="list-card">
        <div>
          <p className="eyebrow">Recent traces</p>
          <h2>Newest spans</h2>
        </div>
        <div className="table-shell">
          {traces.length === 0 ? <p className="muted">No spans have been recorded yet.</p> : null}
          {traces.map((trace) => (
            <div key={trace.spanId} className="trace-row">
              <div>
                <strong>{trace.name}</strong>
                <p>{trace.traceId}</p>
              </div>
              <div>
                <span>{trace.startTime}</span>
                <span>{trace.endTime}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
