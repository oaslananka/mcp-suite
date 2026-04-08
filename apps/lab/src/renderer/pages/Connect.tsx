import type { CSSProperties, FormEvent, JSX } from "react";
import { useMemo, useState } from "react";
import { ServerStatus } from "../components/ServerStatus.js";
import { connectionStore, useConnectionStore } from "../stores/connectionStore.js";

export function ConnectPage(): JSX.Element {
  const { status, error, serverInfo, savedConnections } = useConnectionStore();
  const [type, setType] = useState<"stdio" | "http">("stdio");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://localhost:3000/mcp");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("-y @modelcontextprotocol/server-filesystem");

  const favoriteConnections = useMemo(
    () => savedConnections.filter((connection) => connection.favorite),
    [savedConnections],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await connectionStore.connect({
      type,
      name: name.trim() || undefined,
      url: type === "http" ? url.trim() : undefined,
      command: type === "stdio" ? command.trim() : undefined,
      args: type === "stdio"
        ? args.split(" ").map((value) => value.trim()).filter(Boolean)
        : undefined,
    });
  }

  return (
    <div style={styles.page}>
      <ServerStatus
        status={status}
        connection={serverInfo?.connection}
        error={error}
      />

      <div style={styles.layout}>
        <form style={styles.panel} onSubmit={(event) => void handleSubmit(event)}>
          <div style={styles.panelHeader}>
            <h2 style={styles.title}>Connection</h2>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void connectionStore.disconnect()}
            >
              Disconnect
            </button>
          </div>

          <label style={styles.field}>
            <span>Display name</span>
            <input style={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="GitHub Dev Server" />
          </label>

          <label style={styles.field}>
            <span>Transport</span>
            <select style={styles.input} value={type} onChange={(event) => setType(event.target.value as "stdio" | "http")}>
              <option value="stdio">STDIO</option>
              <option value="http">HTTP</option>
            </select>
          </label>

          {type === "http" ? (
            <label style={styles.field}>
              <span>Server URL</span>
              <input style={styles.input} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://localhost:3000/mcp" />
            </label>
          ) : (
            <>
              <label style={styles.field}>
                <span>Command</span>
                <input style={styles.input} value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx" />
              </label>
              <label style={styles.field}>
                <span>Arguments</span>
                <input style={styles.input} value={args} onChange={(event) => setArgs(event.target.value)} placeholder="-y @modelcontextprotocol/server-github" />
              </label>
            </>
          )}

          <button type="submit" style={styles.primaryButton} disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting..." : "Connect"}
          </button>
        </form>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.title}>Saved Connections</h2>
            <button type="button" style={styles.secondaryButton} onClick={() => void connectionStore.hydrate()}>
              Refresh
            </button>
          </div>

          {favoriteConnections.length > 0 ? (
            <div style={styles.favoriteStrip}>
              {favoriteConnections.map((connection) => (
                <button
                  key={connection.id}
                  type="button"
                  style={styles.favoriteChip}
                  onClick={() => void connectionStore.connect({
                    type: connection.type,
                    name: connection.name,
                    url: connection.type === "http" ? connection.endpoint : undefined,
                    command: connection.command,
                    args: connection.args,
                  })}
                >
                  {connection.name}
                </button>
              ))}
            </div>
          ) : null}

          <div style={styles.connectionList}>
            {savedConnections.length === 0 ? (
              <div style={styles.empty}>No saved connections yet.</div>
            ) : savedConnections.map((connection) => (
              <article key={connection.id} style={styles.connectionCard}>
                <div>
                  <strong>{connection.name}</strong>
                  <div style={styles.muted}>{connection.type.toUpperCase()} · {connection.endpoint}</div>
                </div>
                <div style={styles.connectionActions}>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => void connectionStore.toggleFavorite(connection.id, !connection.favorite)}
                  >
                    {connection.favorite ? "Unfavorite" : "Favorite"}
                  </button>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => void connectionStore.connect({
                      type: connection.type,
                      name: connection.name,
                      url: connection.type === "http" ? connection.endpoint : undefined,
                      command: connection.command,
                      args: connection.args,
                    })}
                  >
                    Use
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "grid",
    gap: 20,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 420px) 1fr",
    gap: 20,
  },
  panel: {
    border: "1px solid #dbe4f0",
    borderRadius: 18,
    padding: 20,
    background: "#ffffff",
    display: "grid",
    gap: 16,
    alignContent: "start",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: "#0f172a",
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#0f172a",
    fontWeight: 600,
  },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
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
  favoriteStrip: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
  },
  favoriteChip: {
    border: "1px solid #bae6fd",
    borderRadius: 999,
    padding: "8px 12px",
    background: "#ecfeff",
    color: "#0f172a",
    cursor: "pointer",
  },
  connectionList: {
    display: "grid",
    gap: 12,
  },
  connectionCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  connectionActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  },
  muted: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
  },
} satisfies Record<string, CSSProperties>;
