import type { CSSProperties, JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { JsonEditor } from "../components/JsonEditor.js";
import { ToolCard } from "../components/ToolCard.js";
import { connectionStore, useConnectionStore } from "../stores/connectionStore.js";
import { historyStore } from "../stores/historyStore.js";

export function ToolsPage(): JSX.Element {
  const { status, tools } = useConnectionStore();
  const [query, setQuery] = useState("");
  const [selectedToolName, setSelectedToolName] = useState<string>();
  const [requestJson, setRequestJson] = useState("{\n  \n}");
  const [responseJson, setResponseJson] = useState("{\n  \"status\": \"No tool call yet\"\n}");
  const [latency, setLatency] = useState<number>();

  useEffect(() => {
    if (!selectedToolName && tools[0]) {
      setSelectedToolName(tools[0].name);
    }
  }, [selectedToolName, tools]);

  const filteredTools = useMemo(
    () => tools.filter((tool) => tool.name.toLowerCase().includes(query.toLowerCase())),
    [query, tools],
  );

  const selectedTool = filteredTools.find((tool) => tool.name === selectedToolName)
    ?? tools.find((tool) => tool.name === selectedToolName)
    ?? filteredTools[0];

  async function handleCall(): Promise<void> {
    if (!selectedTool || !window.labApi) {
      return;
    }

    const parsed = requestJson.trim() ? JSON.parse(requestJson) as Record<string, unknown> : {};
    const result = await window.labApi.callTool(selectedTool.name, parsed);
    setLatency(result.latency);
    setResponseJson(JSON.stringify(result.result, null, 2));
    await historyStore.hydrate();
  }

  return (
    <div style={styles.page}>
      <section style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.title}>Tools</h2>
          <button type="button" style={styles.secondaryButton} onClick={() => void connectionStore.refreshCatalog()}>
            Refresh
          </button>
        </div>

        <input
          style={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools"
        />

        <div style={styles.toolList}>
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              selected={tool.name === selectedTool?.name}
              onClick={() => setSelectedToolName(tool.name)}
            />
          ))}
          {filteredTools.length === 0 ? <div style={styles.empty}>No tools match this search.</div> : null}
        </div>
      </section>

      <section style={styles.rightPanel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.title}>{selectedTool?.name ?? "Select a tool"}</h2>
            <div style={styles.subtitle}>{selectedTool?.description ?? "Connect to a server to inspect tool contracts."}</div>
          </div>
          <div style={styles.latency}>{latency ? `${latency} ms` : status === "connected" ? "Ready" : "Disconnected"}</div>
        </div>

        <JsonEditor
          label="Arguments"
          value={requestJson}
          onChange={setRequestJson}
          height={220}
        />

        <JsonEditor
          label="Schema"
          value={JSON.stringify(selectedTool?.inputSchema ?? {}, null, 2)}
          readOnly
          height={220}
        />

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.primaryButton}
            disabled={status !== "connected" || !selectedTool}
            onClick={() => void handleCall()}
          >
            Call Tool
          </button>
        </div>

        <JsonEditor
          label="Response"
          value={responseJson}
          readOnly
          height={260}
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
    minHeight: 0,
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
  subtitle: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 14,
  },
  latency: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "#ecfeff",
    color: "#155e75",
    fontWeight: 700,
  },
  search: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
  },
  toolList: {
    display: "grid",
    gap: 10,
    maxHeight: 620,
    overflow: "auto",
    paddingRight: 4,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
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
