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
      <div style={styles.meta}>
        {connection
          ? `${connection.type.toUpperCase()} · ${connection.endpoint}`
          : "Connect an MCP server to inspect tools and prompts."}
      </div>
      {error ? <div style={styles.error}>{error}</div> : null}
    </section>
  );
}

const statusPalettes = {
  idle: { background: "#e7edf6", text: "#243449", border: "#c9d7ec" },
  connecting: { background: "#fef2d7", text: "#8c4b08", border: "#f7cf8a" },
  connected: { background: "#dff7e8", text: "#0f6a3b", border: "#9ee2bb" },
  error: { background: "#fee6e6", text: "#a51424", border: "#f6b7bd" },
} as const;

const styles = {
  card: {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 18,
    padding: 18,
    background: "rgba(255, 255, 255, 0.82)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
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
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
  },
  meta: {
    color: "#44557a",
    fontSize: 14,
  },
  error: {
    color: "#b7191f",
    fontSize: 13,
    fontWeight: 600,
  },
} satisfies Record<string, CSSProperties>;
