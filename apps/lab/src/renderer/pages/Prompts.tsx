import type { CSSProperties, JSX } from "react";
import { useEffect, useState } from "react";
import { JsonEditor } from "../components/JsonEditor.js";
import { connectionStore, useConnectionStore } from "../stores/connectionStore.js";

export function PromptsPage(): JSX.Element {
  const { prompts, status } = useConnectionStore();
  const [selectedPrompt, setSelectedPrompt] = useState<string>();
  const [argsJson, setArgsJson] = useState("{\n  \n}");
  const [resultJson, setResultJson] = useState("{\n  \"status\": \"Select a prompt\"\n}");

  useEffect(() => {
    if (!selectedPrompt && prompts[0]) {
      setSelectedPrompt(prompts[0].name);
    }
  }, [prompts, selectedPrompt]);

  async function handleRun(): Promise<void> {
    if (!selectedPrompt) {
      return;
    }

    const parsed = argsJson.trim() ? JSON.parse(argsJson) as Record<string, unknown> : {};
    const result = await window.labApi?.getPrompt(selectedPrompt, parsed);
    setResultJson(JSON.stringify(result, null, 2));
  }

  return (
    <div style={styles.page}>
      <section style={styles.listPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.title}>Prompts</h2>
          <button type="button" style={styles.secondaryButton} onClick={() => void connectionStore.refreshCatalog()}>
            Refresh
          </button>
        </div>

        <div style={styles.promptList}>
          {prompts.length === 0 ? <div style={styles.empty}>This server does not expose prompt templates.</div> : prompts.map((prompt) => (
            <button
              key={prompt.name}
              type="button"
              style={{
                ...styles.promptCard,
                ...(prompt.name === selectedPrompt ? styles.promptCardActive : {}),
              }}
              onClick={() => setSelectedPrompt(prompt.name)}
            >
              <strong>{prompt.name}</strong>
              <span style={styles.description}>{prompt.description ?? "No description provided."}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={styles.viewerPanel}>
        <JsonEditor label="Arguments" value={argsJson} onChange={setArgsJson} height={220} />
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} disabled={status !== "connected" || !selectedPrompt} onClick={() => void handleRun()}>
            Render Prompt
          </button>
        </div>
        <JsonEditor label="Prompt Result" value={resultJson} readOnly height={380} />
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
  listPanel: {
    border: "1px solid #dbe4f0",
    borderRadius: 18,
    padding: 18,
    background: "#ffffff",
    display: "grid",
    gap: 14,
    alignContent: "start",
  },
  viewerPanel: {
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
  },
  title: {
    margin: 0,
    color: "#0f172a",
  },
  promptList: {
    display: "grid",
    gap: 10,
  },
  promptCard: {
    border: "1px solid #dbe4f0",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    display: "grid",
    gap: 6,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  promptCardActive: {
    borderColor: "#38bdf8",
    boxShadow: "0 0 0 3px rgba(56, 189, 248, 0.14)",
  },
  description: {
    color: "#64748b",
    fontSize: 13,
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
