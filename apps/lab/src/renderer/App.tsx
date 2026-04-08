import type { CSSProperties, JSX } from "react";
import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar.js";
import { ServerStatus } from "./components/ServerStatus.js";
import { ConnectPage } from "./pages/Connect.js";
import { HistoryPage } from "./pages/History.js";
import { PromptsPage } from "./pages/Prompts.js";
import { ResourcesPage } from "./pages/Resources.js";
import { ToolsPage } from "./pages/Tools.js";
import { connectionStore, useConnectionStore } from "./stores/connectionStore.js";
import { historyStore } from "./stores/historyStore.js";

function AppLayout(): JSX.Element {
  const { status, error, serverInfo } = useConnectionStore();

  useEffect(() => {
    void connectionStore.hydrate();
    void historyStore.hydrate();
  }, []);

  return (
    <div style={styles.shell}>
      <Sidebar />
      <div style={styles.content}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Desktop Debug Console</div>
            <h1 style={styles.title}>Model Context Protocol Lab</h1>
          </div>
          <div style={styles.headerStatus}>
            <ServerStatus status={status} connection={serverInfo?.connection} error={error} />
          </div>
        </header>

        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<ConnectPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}

const styles = {
  shell: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)",
    color: "#0f172a",
  },
  content: {
    padding: 24,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 20,
    minHeight: "100vh",
  },
  header: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(320px, 420px)",
    gap: 20,
    alignItems: "start",
  },
  headerStatus: {
    alignSelf: "stretch",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#0369a1",
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
  },
  main: {
    minHeight: 0,
  },
} satisfies Record<string, CSSProperties>;
