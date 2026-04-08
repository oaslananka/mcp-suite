import type { CSSProperties, JSX } from "react";
import type { ConnectionRecord } from "../types.js";

interface ServerStatusProps {
  status: "idle" | "connecting" | "connected" | "error";
  connection: ConnectionRecord | undefined;
  error: string | undefined;
}

export function ServerStatus({ status, connection, error }: ServerStatusProps): JSX.Element {
  const palette = statusPalettes[status];

  return (
    <section style={{ ...styles.card, borderColor: palette.border }}>
      <div style={styles.headingRow}>
        <div style={{ ...styles.badge, background: palette.background, color: palette.text }}>
          {status.toUpperCase()}
        </div>
        <strong>{connection?.name ?? "No active server"}</strong>
      </div>
      <div style={styles.meta}>{connection ? `${connection.type.toUpperCase()} · ${connection.endpoint}` : "Connect an MCP server to inspect tools and prompts."}</div>
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

const statusPalettes = {
  idle: { background: "#e2e8f0", text: "#334155", border: "#cbd5e1" },
  connecting: { background: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  connected: { background: "#dcfce7", text: "#166534", border: "#86efac" },
  error: { background: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
} as const;

const styles = {
  card: {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 16,
    padding: 16,
    background: "#ffffff",
    display: "grid",
    gap: 8,
  },
  headingRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  badge: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
  },
  meta: {
    color: "#475569",
    fontSize: 14,
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 600,
  },
} satisfies Record<string, CSSProperties>;
