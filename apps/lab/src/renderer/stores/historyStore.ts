import { useSyncExternalStore } from "react";
import { ToolHistoryRecord } from "../types.js";

interface HistoryState {
  entries: ToolHistoryRecord[];
  selectedId: number | undefined;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: HistoryState = {
  entries: [],
  selectedId: undefined,
};

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<HistoryState>): void {
  state = { ...state, ...patch };
  emit();
}

export const historyStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): HistoryState {
    return state;
  },
  async hydrate(): Promise<void> {
    const entries = await window.labApi?.listHistory();
    setState({
      entries: entries ?? [],
      selectedId: entries?.[0]?.id,
    });
  },
  select(id: number): void {
    setState({ selectedId: id });
  },
};

export function useHistoryStore(): HistoryState {
  return useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot);
}
