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
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppLayout />
    </HashRouter>
  );
}

const styles = {
  shell: {
    display: "grid",
    gridTemplateColumns: "272px 1fr",
    minHeight: "100vh",
    color: "#0e1a32",
  },
  content: {
    padding: "28px 30px",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 24,
    minHeight: "100vh",
  },
  header: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(320px, 500px)",
    gap: 24,
    alignItems: "start",
  },
  headerStatus: {
    alignSelf: "stretch",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "#075985",
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontFamily: '"Fraunces", Georgia, serif',
    fontSize: 46,
    lineHeight: 1.05,
    letterSpacing: "-0.01em",
  },
  main: {
    minHeight: 0,
  },
} satisfies Record<string, CSSProperties>;
