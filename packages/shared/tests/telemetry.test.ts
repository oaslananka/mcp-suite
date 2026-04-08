import { describe, expect, it } from "vitest";
import { createCounter, createHistogram } from "../src/telemetry/metrics.js";
import { withSpan } from "../src/telemetry/tracer.js";

describe("telemetry helpers", () => {
    it("tracks in-memory counters and histograms", () => {
        const counter = createCounter("mcp.calls", "Number of MCP calls");
        counter.add();
        counter.add(2);

        const histogram = createHistogram("mcp.latency", "Latency in milliseconds");
        histogram.record(10);
        histogram.record(20);

        expect(counter.value()).toBe(3);
        expect(histogram.snapshot()).toEqual({
            count: 2,
            min: 10,
            max: 20,
            sum: 30,
            average: 15,
        });
    });

    it("wraps async work in a span and returns the original result", async () => {
        await expect(withSpan("demo", async () => "ok")).resolves.toBe("ok");
        await expect(withSpan("demo-error", async () => {
            throw new Error("boom");
        })).rejects.toThrow("boom");
    });
});
