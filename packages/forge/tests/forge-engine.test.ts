import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PipelineConfig } from "../src/dsl/schema.js";
import { ForgeEngine } from "../src/engine/ForgeEngine.js";

describe("ForgeEngine", () => {
  afterEach(() => {
    delete process.env["FORGE_TEST_URL"];
  });

  it("runs a minimal pipeline successfully and records the run", async () => {
    const engine = new ForgeEngine({ dbPath: ":memory:" });
    const pipeline: PipelineConfig = {
      name: "hello-pipeline",
      version: "1",
      steps: [{ id: "announce", type: "log", message: "Hello {{ greeting }}" }]
    };

    try {
      const result = await engine.run(pipeline, { greeting: "world" });
      const runs = (engine as unknown as { runStore: { listRuns: () => unknown[] } }).runStore.listRuns();

      expect(result.status).toBe("success");
      expect(result.pipelineId).toBe("hello-pipeline");
      expect(runs).toHaveLength(1);
    } finally {
      await engine.stop();
    }
  });

  it("returns failed status when a step fails inside executor flow", async () => {
    const engine = new ForgeEngine({ dbPath: ":memory:" });
    const pipeline: PipelineConfig = {
      name: "loop-failure",
      version: "1",
      steps: [
        {
          id: "loop",
          type: "loop",
          over: "{{ missingItems }}",
          as: "item",
          steps: [{ id: "announce", type: "log", message: "{{ item }}" }]
        }
      ]
    };

    try {
      const result = await engine.run(pipeline);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("did not evaluate to an array");
    } finally {
      await engine.stop();
    }
  });

  it("supports dry-run execution without calling external nodes", async () => {
    const engine = new ForgeEngine({ dbPath: ":memory:" });
    const pipeline: PipelineConfig = {
      name: "dry-run-http",
      version: "1",
      steps: [
        {
          id: "request",
          type: "http",
          url: "https://127.0.0.1:1/unreachable",
          method: "GET"
        }
      ]
    };

    try {
      const result = await engine.run(pipeline, {}, true);

      expect(result.status).toBe("success");
    } finally {
      await engine.stop();
    }
  });

  it("loads pipeline definitions from disk with runFile", async () => {
    const engine = new ForgeEngine({ dbPath: ":memory:" });
    const dir = await mkdtemp(join(tmpdir(), "forge-engine-"));
    const filePath = join(dir, "pipeline.yaml");
    process.env["FORGE_TEST_URL"] = "https://registry.example.com";

    try {
      await writeFile(
        filePath,
        `
name: file-pipeline
version: "1"
servers:
  registry:
    transport: http
    url: ${"${FORGE_TEST_URL}"}
steps:
  - id: announce
    type: log
    message: "File run"
`,
        "utf8"
      );

      const result = await engine.runFile(filePath);

      expect(result).toMatchObject({
        pipelineId: "file-pipeline",
        status: "success"
      });
    } finally {
      await engine.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts and stops cleanly", async () => {
    const engine = new ForgeEngine({ dbPath: ":memory:" });

    await expect(engine.start()).resolves.toBeUndefined();
    await expect(engine.stop()).resolves.toBeUndefined();
  });
});
