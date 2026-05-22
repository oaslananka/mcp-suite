import type { CSSProperties, JSX } from "react";
import type { ToolHistoryRecord } from "../types.js";

interface TraceViewerProps {
  entries: ToolHistoryRecord[];
}

export function TraceViewer({ entries }: TraceViewerProps): JSX.Element {
  const topLatency = Math.max(...entries.map((entry) => entry.latencyMs), 1);

  return (
    <section style={styles.wrapper}>
      <div style={styles.title}>Recent Waterfall</div>
      <div style={styles.rows}>
        {entries.slice(0, 8).map((entry) => (
          <div key={entry.id} style={styles.row}>
            <div style={styles.label}>{entry.toolName}</div>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${Math.max((entry.latencyMs / topLatency) * 100, 8)}%`,
                  background: entry.isError ? "#f87171" : "#38bdf8",
                }}
              />
            </div>
            <div style={styles.value}>{entry.latencyMs} ms</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const styles = {
  wrapper: {
    border: "1px solid #dbe4f0",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
    display: "grid",
    gap: 12,
  },
  title: {
    fontWeight: 700,
    color: "#0f172a",
  },
  rows: {
    display: "grid",
    gap: 10,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "180px 1fr 72px",
    gap: 12,
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    color: "#1e293b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  barTrack: {
    background: "#e2e8f0",
    borderRadius: 999,
    height: 10,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  value: {
    textAlign: "right" as const,
    color: "#475569",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
} satisfies Record<string, CSSProperties>;
