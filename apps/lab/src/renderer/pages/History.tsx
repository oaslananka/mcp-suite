import type { CSSProperties, JSX } from "react";
import { useMemo } from "react";
import { JsonEditor } from "../components/JsonEditor.js";
import { TraceViewer } from "../components/TraceViewer.js";
import { historyStore, useHistoryStore } from "../stores/historyStore.js";

function toCurlSnippet(toolName: string, input: string): string {
  return [
    "curl -X POST http://localhost:3000/mcp/tools/call \\",
    '  -H "Content-Type: application/json" \\',
    `  -d '${JSON.stringify({ name: toolName, arguments: JSON.parse(input || "{}") }, null, 2)}'`,
  ].join("\n");
}

function toForgePipeline(toolName: string, input: string): string {
  return [
    "name: replay-tool-call",
    "steps:",
    `  - id: replay-${toolName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    "    tool:",
    `      name: ${toolName}`,
    "      arguments:",
    ...JSON.stringify(JSON.parse(input || "{}"), null, 2)
      .split("\n")
      .map((line) => `        ${line}`),
  ].join("\n");
}

export function HistoryPage(): JSX.Element {
  const { entries, selectedId } = useHistoryStore();
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  const exports = useMemo(() => {
    if (!selectedEntry) {
      return {
        json: '{\n  "status": "No history"\n}',
        curl: "# No history",
        pipeline: "# No history",
      };
    }

    return {
      json: JSON.stringify(selectedEntry, null, 2),
      curl: toCurlSnippet(selectedEntry.toolName, selectedEntry.input),
      pipeline: toForgePipeline(selectedEntry.toolName, selectedEntry.input),
    };
  }, [selectedEntry]);

  async function handleReplay(): Promise<void> {
    if (!selectedEntry || !window.labApi) {
      return;
    }

    const parsedArgs = JSON.parse(selectedEntry.input || "{}") as Record<string, unknown>;
    await window.labApi.callTool(selectedEntry.toolName, parsedArgs);
    await historyStore.hydrate();
  }

  return (
    <div style={styles.page}>
      <section style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.title}>History</h2>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => void historyStore.hydrate()}
          >
            Refresh
          </button>
        </div>

        <div style={styles.historyList}>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={{
                ...styles.historyCard,
                ...(entry.id === selectedEntry?.id ? styles.historyCardActive : {}),
              }}
              onClick={() => historyStore.select(entry.id)}
            >
              <div style={styles.historyHeader}>
                <strong>{entry.toolName}</strong>
                <span
                  style={{
                    ...styles.badge,
                    background: entry.isError ? "#fee2e2" : "#dcfce7",
                    color: entry.isError ? "#991b1b" : "#166534",
                  }}
                >
                  {entry.isError ? "ERROR" : "OK"}
                </span>
              </div>
              <div style={styles.meta}>
                {entry.latencyMs} ms · {new Date(entry.createdAt).toLocaleString()}
              </div>
            </button>
          ))}
          {entries.length === 0 ? (
            <div style={styles.empty}>No tool calls recorded yet.</div>
          ) : null}
        </div>
      </section>

      <section style={styles.rightPanel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.title}>{selectedEntry?.toolName ?? "Select a call"}</h2>
            <div style={styles.meta}>
              {selectedEntry
                ? `Connection ${selectedEntry.connectionId}`
                : "Pick a prior tool call to inspect or replay."}
            </div>
          </div>
          <button
            type="button"
            style={styles.primaryButton}
            disabled={!selectedEntry}
            onClick={() => void handleReplay()}
          >
            Replay
          </button>
        </div>

        <TraceViewer entries={entries} />
        <JsonEditor label="History Record" value={exports.json} readOnly height={220} />
        <JsonEditor label="Export as curl" value={exports.curl} readOnly height={180} />
        <JsonEditor
          label="Export as Forge Pipeline"
          value={exports.pipeline}
          readOnly
          height={220}
        />
      </section>
    </div>
  );
}

const styles = {
  page: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 20,
  },
  leftPanel: {
    border: "1px solid #dbe4f0",
    borderRadius: 18,
    padding: 18,
    background: "#ffffff",
    display: "grid",
    gap: 14,
    alignContent: "start",
  },
  rightPanel: {
    border: "1px solid #dbe4f0",
    borderRadius: 18,
    padding: 18,
    background: "#ffffff",
    display: "grid",
    gap: 16,
    alignContent: "start",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    margin: 0,
    color: "#0f172a",
  },
  historyList: {
    display: "grid",
    gap: 10,
    maxHeight: 720,
    overflow: "auto",
    paddingRight: 4,
  },
  historyCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbe4f0",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    display: "grid",
    gap: 6,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  historyCardActive: {
    borderColor: "#38bdf8",
    boxShadow: "0 0 0 3px rgba(56, 189, 248, 0.14)",
  },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  badge: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
  },
  primaryButton: {
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    background: "#0284c7",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#f8fafc",
    color: "#1e293b",
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
  },
} satisfies Record<string, CSSProperties>;
