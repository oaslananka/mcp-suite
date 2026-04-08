import type { CSSProperties, JSX } from "react";
import { useEffect, useState } from "react";
import { JsonEditor } from "../components/JsonEditor.js";
import { connectionStore, useConnectionStore } from "../stores/connectionStore.js";

export function ResourcesPage(): JSX.Element {
  const { resources, status } = useConnectionStore();
  const [selectedUri, setSelectedUri] = useState<string>();
  const [content, setContent] = useState("{\n  \"status\": \"Select a resource\"\n}");

  useEffect(() => {
    if (!selectedUri && resources[0]) {
      setSelectedUri(resources[0].uri);
    }
  }, [resources, selectedUri]);

  async function handleRead(uri: string): Promise<void> {
    setSelectedUri(uri);
    const result = await window.labApi?.readResource(uri);
    setContent(JSON.stringify(result, null, 2));
  }

  return (
    <div style={styles.page}>
      <section style={styles.listPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.title}>Resources</h2>
          <button type="button" style={styles.secondaryButton} onClick={() => void connectionStore.refreshCatalog()}>
            Refresh
          </button>
        </div>

        <div style={styles.resourceList}>
          {resources.length === 0 ? <div style={styles.empty}>No resources exposed by this server.</div> : resources.map((resource) => (
            <button
              key={resource.uri}
              type="button"
              style={{
                ...styles.resourceCard,
                ...(resource.uri === selectedUri ? styles.resourceCardActive : {}),
              }}
              onClick={() => void handleRead(resource.uri)}
              disabled={status !== "connected"}
            >
              <strong>{resource.name ?? resource.uri}</strong>
              <span style={styles.description}>{resource.description ?? resource.uri}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={styles.viewerPanel}>
        <JsonEditor label="Resource Content" value={content} readOnly height={620} />
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
  resourceList: {
    display: "grid",
    gap: 10,
  },
  resourceCard: {
    border: "1px solid #dbe4f0",
    borderRadius: 14,
    padding: 14,
    background: "#fff",
    display: "grid",
    gap: 6,
    textAlign: "left" as const,
    cursor: "pointer",
  },
  resourceCardActive: {
    borderColor: "#38bdf8",
    boxShadow: "0 0 0 3px rgba(56, 189, 248, 0.14)",
  },
  description: {
    color: "#64748b",
    fontSize: 13,
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
