import { SQLiteStore } from "../storage/SQLiteStore.js";

export class MCPServerInstrument {
  constructor(private readonly store: SQLiteStore) {}

  recordLatency(toolName: string, latencyMs: number): void {
    this.store.insertMetric({
      name: "latency",
      value: latencyMs,
      timestamp: new Date().toISOString(),
      toolName
    });
  }
}
