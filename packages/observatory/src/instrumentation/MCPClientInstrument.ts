import { SQLiteStore } from "../storage/SQLiteStore.js";

export class MCPClientInstrument {
  constructor(private readonly store: SQLiteStore) {}

  recordCall(toolName: string, latencyMs: number, isError = false): void {
    const timestamp = new Date().toISOString();
    this.store.insertMetric({ name: "calls", value: 1, timestamp, toolName });
    this.store.insertMetric({ name: "latency", value: latencyMs, timestamp, toolName });
    if (isError) {
      this.store.insertMetric({ name: "errors", value: 1, timestamp, toolName });
    }
  }
}
