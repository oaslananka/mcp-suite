import { useSyncExternalStore } from "react";
import { ConnectServerOptions, ConnectionRecord, PromptSummary, ResourceSummary, ServerInfoPayload, ToolSummary } from "../types.js";

interface ConnectionState {
  status: "idle" | "connecting" | "connected" | "error";
  error: string | undefined;
  serverInfo: ServerInfoPayload | undefined;
  savedConnections: ConnectionRecord[];
  tools: ToolSummary[];
  resources: ResourceSummary[];
  prompts: PromptSummary[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: ConnectionState = {
  status: "idle",
  error: undefined,
  serverInfo: undefined,
  savedConnections: [],
  tools: [],
  resources: [],
  prompts: [],
};

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<ConnectionState>): void {
  state = { ...state, ...patch };
  emit();
}

async function refreshSavedConnections(): Promise<void> {
  const connections = await window.labApi?.listConnections();
  setState({ savedConnections: connections ?? [] });
}

async function refreshCatalog(): Promise<void> {
  if (!window.labApi) {
    return;
  }

  const [tools, resources, prompts] = await Promise.all([
    window.labApi.listTools().catch(() => ({ tools: [] })),
    window.labApi.listResources().catch(() => ({ resources: [] })),
    window.labApi.listPrompts().catch(() => ({ prompts: [] })),
  ]);

  setState({
    tools: tools.tools,
    resources: resources.resources,
    prompts: prompts.prompts,
  });
}

export const connectionStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ConnectionState {
    return state;
  },
  async hydrate(): Promise<void> {
    await refreshSavedConnections();
    if (!window.labApi) {
      return;
    }

    const info = await window.labApi.getServerInfo();
    if (info.connected) {
      setState({ status: "connected", serverInfo: info, error: undefined });
      await refreshCatalog();
      return;
    }

    setState({ status: "idle", serverInfo: info, error: undefined, tools: [], resources: [], prompts: [] });
  },
  async connect(opts: ConnectServerOptions): Promise<void> {
    if (!window.labApi) {
      setState({ status: "error", error: "Desktop bridge is unavailable." });
      return;
    }

    setState({ status: "connecting", error: undefined });
    const result = await window.labApi.connectServer(opts);

    if (!result.success) {
      setState({
        status: "error",
        error: result.error ?? "Connection failed.",
      });
      await refreshSavedConnections();
      return;
    }

    setState({
      status: "connected",
      error: undefined,
      serverInfo: {
        connected: true,
        connection: result.connection,
        capabilities: result.capabilities,
        serverInfo: result.serverInfo,
      },
    });
    await Promise.all([refreshSavedConnections(), refreshCatalog()]);
  },
  async disconnect(): Promise<void> {
    await window.labApi?.disconnectServer();
    setState({
      status: "idle",
      error: undefined,
      serverInfo: { connected: false, connection: undefined, capabilities: undefined, serverInfo: undefined },
      tools: [],
      resources: [],
      prompts: [],
    });
  },
  async toggleFavorite(connectionId: string, favorite: boolean): Promise<void> {
    await window.labApi?.setFavoriteConnection(connectionId, favorite);
    await refreshSavedConnections();
  },
  async refreshCatalog(): Promise<void> {
    if (state.serverInfo?.connected) {
      await refreshCatalog();
    }
  },
};

export function useConnectionStore(): ConnectionState {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot);
}
