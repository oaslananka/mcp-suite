import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { OTelCollector } from "../src/collector/OTelCollector.js";
import { MCPClientInstrument } from "../src/instrumentation/MCPClientInstrument.js";
import { MCPServerInstrument } from "../src/instrumentation/MCPServerInstrument.js";
import { SQLiteStore } from "../src/storage/SQLiteStore.js";

describe("Observatory instrumentation helpers", () => {
  it("collects spans and records client/server metrics", () => {
    const store = new SQLiteStore(new Database(":memory:"));
    const collector = new OTelCollector(store);
    const clientInstrument = new MCPClientInstrument(store);
    const serverInstrument = new MCPServerInstrument(store);

    collector.receiveSpan({
      traceId: "trace-1",
      spanId: "span-1",
      name: "client.call",
      startTime: new Date(Date.now() - 1000).toISOString(),
      endTime: new Date().toISOString(),
    });

    clientInstrument.recordCall("search", 120, true);
    serverInstrument.recordLatency("search", 95);

    expect(store.querySpans({ traceId: "trace-1" })).toHaveLength(1);
    expect(store.queryMetrics("calls", new Date(Date.now() - 3600_000), new Date())).toHaveLength(1);
    expect(store.queryMetrics("errors", new Date(Date.now() - 3600_000), new Date())).toHaveLength(1);
    expect(store.queryMetrics("latency", new Date(Date.now() - 3600_000), new Date()).length).toBeGreaterThanOrEqual(2);
  });
});
