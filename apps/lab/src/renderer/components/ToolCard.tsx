import type { CSSProperties, JSX } from "react";
import type { ToolSummary } from "../types.js";

interface ToolCardProps {
  selected: boolean;
  tool: ToolSummary;
  onClick: () => void;
}

export function ToolCard({ selected, tool, onClick }: ToolCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.card,
        ...(selected ? styles.selected : {}),
      }}
    >
      <strong>{tool.name}</strong>
      <span style={styles.description}>{tool.description ?? "No description provided."}</span>
    </button>
  );
}

const styles = {
  card: {
    border: "1px solid #dbe4f0",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    display: "grid",
    gap: 6,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  selected: {
    borderColor: "#38bdf8",
    boxShadow: "0 0 0 3px rgba(56, 189, 248, 0.14)",
  },
  description: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;
