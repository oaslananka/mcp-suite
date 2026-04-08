import type { CSSProperties, FormEvent, JSX } from "react";
import { useMemo, useState } from "react";
import { connectionStore, useConnectionStore } from "../stores/connectionStore.js";

export function ConnectPage(): JSX.Element {
  const { status, savedConnections, serverInfo } = useConnectionStore();
  const [type, setType] = useState<"stdio" | "http">("stdio");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("http://localhost:3000/mcp");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("-y @modelcontextprotocol/server-filesystem .");
  const [showRecentOnly, setShowRecentOnly] = useState(false);
  const connectedConnectionId = serverInfo?.connected ? serverInfo.connection?.id : undefined;
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const sortedConnections = useMemo(
    () =>
      [...savedConnections].sort((left, right) => {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [savedConnections]
  );
  const visibleConnections = useMemo(
    () => (showRecentOnly ? sortedConnections.slice(0, 5) : sortedConnections),
    [showRecentOnly, sortedConnections]
  );

  const favoriteConnections = useMemo(
    () => savedConnections.filter((connection) => connection.favorite),
    [savedConnections]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (isConnected) {
      await connectionStore.disconnect();
      return;
    }

    await connectionStore.connect({
      type,
      name: name.trim() || undefined,
      url: type === "http" ? url.trim() : undefined,
      command: type === "stdio" ? command.trim() : undefined,
      args:
        type === "stdio"
          ? args
              .split(" ")
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined,
    });
  }

  async function handleDelete(connectionId: string): Promise<void> {
    if (!window.confirm("Delete this saved connection?")) {
      return;
    }
    await connectionStore.deleteConnection(connectionId);
  }

  async function handleDeleteAll(): Promise<void> {
    if (savedConnections.length === 0) {
      return;
    }
    if (!window.confirm(`Delete all ${savedConnections.length} saved connections?`)) {
      return;
    }
    await connectionStore.deleteAllConnections();
  }

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <form style={styles.panel} onSubmit={(event) => void handleSubmit(event)}>
          <div style={styles.panelHeader}>
            <h2 style={styles.title}>Connection</h2>
            <span
              style={{
                ...styles.statusBadge,
                ...(isConnected
                  ? styles.statusConnected
                  : isConnecting
                    ? styles.statusConnecting
                    : styles.statusIdle),
              }}
            >
              {isConnected ? "Connected" : isConnecting ? "Connecting" : "Disconnected"}
            </span>
          </div>

          <label style={styles.field}>
            <span>Display name</span>
            <input
              style={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="GitHub Dev Server"
            />
          </label>

          <label style={styles.field}>
            <span>Transport</span>
            <select
              style={styles.input}
              value={type}
              onChange={(event) => setType(event.target.value as "stdio" | "http")}
            >
              <option value="stdio">STDIO</option>
              <option value="http">HTTP</option>
            </select>
          </label>

          {type === "http" ? (
            <label style={styles.field}>
              <span>Server URL</span>
              <input
                style={styles.input}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="http://localhost:3000/mcp"
              />
            </label>
          ) : (
            <>
              <label style={styles.field}>
                <span>Command</span>
                <input
                  style={styles.input}
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="npx"
                />
              </label>
              <label style={styles.field}>
                <span>Arguments</span>
                <input
                  style={styles.input}
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                  placeholder="-y @modelcontextprotocol/server-github"
                />
              </label>
            </>
          )}

          <button
            type="submit"
            style={{
              ...styles.primaryButton,
              ...(isConnected ? styles.primaryDisconnectButton : {}),
            }}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect"}
          </button>
        </form>

        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.title}>Saved Connections</h2>
            <div style={styles.headerActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowRecentOnly((value) => !value)}
                disabled={savedConnections.length === 0}
              >
                {showRecentOnly ? "Show All" : "Recent Only"}
              </button>
              <button
                type="button"
                style={styles.dangerButton}
                onClick={() => void handleDeleteAll()}
                disabled={savedConnections.length === 0}
              >
                Delete All
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => void connectionStore.hydrate()}
              >
                Refresh
              </button>
            </div>
          </div>

          {favoriteConnections.length > 0 ? (
            <div style={styles.favoriteStrip}>
              {favoriteConnections.map((connection) => (
                <button
                  key={connection.id}
                  type="button"
                  style={styles.favoriteChip}
                  onClick={() =>
                    void connectionStore.connect({
                      type: connection.type,
                      name: connection.name,
                      url: connection.type === "http" ? connection.endpoint : undefined,
                      command: connection.command,
                      args: connection.args,
                    })
                  }
                >
                  {connection.name}
                </button>
              ))}
            </div>
          ) : null}

          <div style={styles.connectionList}>
            {savedConnections.length === 0 ? (
              <div style={styles.empty}>No saved connections yet.</div>
            ) : visibleConnections.length === 0 ? (
              <div style={styles.empty}>No recent connections.</div>
            ) : (
              visibleConnections.map((connection) => (
                <article key={connection.id} style={styles.connectionCard}>
                  <div>
                    <strong>{connection.name}</strong>
                    <div style={styles.muted}>
                      {connection.type.toUpperCase()} · {connection.endpoint}
                    </div>
                  </div>
                  <div style={styles.connectionActions}>
                    <button
                      type="button"
                      style={styles.dangerButton}
                      onClick={() => void handleDelete(connection.id)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() =>
                        void connectionStore.toggleFavorite(connection.id, !connection.favorite)
                      }
                    >
                      {connection.favorite ? "Unfavorite" : "Favorite"}
                    </button>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      disabled={isConnecting || connectedConnectionId === connection.id}
                      onClick={() =>
                        void connectionStore.connect({
                          type: connection.type,
                          name: connection.name,
                          url: connection.type === "http" ? connection.endpoint : undefined,
                          command: connection.command,
                          args: connection.args,
                        })
                      }
                    >
                      {connectedConnectionId === connection.id ? "In Use" : "Use"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "grid",
    gap: 22,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(340px, 450px) 1fr",
    gap: 22,
  },
  panel: {
    border: "1px solid #d7e2f4",
    borderRadius: 22,
    padding: 22,
    background: "rgba(255, 255, 255, 0.8)",
    boxShadow: "0 12px 34px rgba(15, 23, 42, 0.07)",
    backdropFilter: "blur(6px)",
    display: "grid",
    gap: 17,
    alignContent: "start",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  statusBadge: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  statusConnected: {
    background: "#dff7e8",
    color: "#0f6a3b",
  },
  statusConnecting: {
    background: "#fef2d7",
    color: "#8c4b08",
  },
  statusIdle: {
    background: "#e7edf6",
    color: "#243449",
  },
  title: {
    margin: 0,
    fontSize: 22,
    color: "#0e1a32",
  },
  field: {
    display: "grid",
    gap: 8,
    color: "#0e1a32",
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: "0.02em",
  },
  input: {
    border: "1px solid #c5d4ec",
    borderRadius: 14,
    padding: "12px 13px",
    fontSize: 14,
    background: "#ffffff",
  },
  primaryButton: {
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(14, 165, 233, 0.25)",
  },
  primaryDisconnectButton: {
    background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    boxShadow: "0 10px 20px rgba(239, 68, 68, 0.22)",
  },
  secondaryButton: {
    border: "1px solid #c5d4ec",
    borderRadius: 14,
    padding: "10px 14px",
    background: "#f8fbff",
    color: "#1b2d50",
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid #f3c2c5",
    borderRadius: 14,
    padding: "10px 14px",
    background: "#fff5f5",
    color: "#b42318",
    fontWeight: 600,
    cursor: "pointer",
  },
  favoriteStrip: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 10,
  },
  favoriteChip: {
    border: "1px solid #b7d8fb",
    borderRadius: 999,
    padding: "8px 12px",
    background: "#eef6ff",
    color: "#0e1a32",
    cursor: "pointer",
  },
  connectionList: {
    display: "grid",
    gap: 12,
  },
  connectionCard: {
    border: "1px solid #dbe6f5",
    borderRadius: 16,
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
    color: "#5b6d8f",
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
  },
} satisfies Record<string, CSSProperties>;
