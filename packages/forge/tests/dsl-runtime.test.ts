import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerPool } from "../src/connections/ServerPool.js";
import { compile } from "../src/dsl/compiler.js";
import { parsePipelineFile, parsePipelineYaml } from "../src/dsl/parser.js";
import type { PipelineConfig } from "../src/dsl/schema.js";
import { ConditionEval } from "../src/engine/ConditionEval.js";
import { DataBus } from "../src/engine/DataBus.js";
import { Pipeline } from "../src/engine/Pipeline.js";
import { Transformer } from "../src/engine/Transformer.js";
import { RunContext } from "../src/runtime/RunContext.js";
import { RunStore } from "../src/runtime/RunStore.js";

describe("Forge DSL and runtime primitives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("stores values in the data bus and resolves nested paths", () => {
    const bus = new DataBus();

    bus.set("user", { profile: { name: "Ada" } });
    bus.set("count", 3);

    expect(bus.get("count")).toBe(3);
    expect(bus.getPath("user.profile.name")).toBe("Ada");
    expect(bus.getAll()).toEqual({
      count: 3,
      user: { profile: { name: "Ada" } }
    });
    expect(bus.toTemplateContext()).toEqual(bus.getAll());
  });

  it("parses pipeline YAML, substitutes env vars, and loads from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "forge-pipeline-"));
    const filePath = join(dir, "pipeline.yaml");
    const yaml = `
name: deploy
version: "1"
servers:
  registry:
    transport: http
    url: ${"${REGISTRY_URL}"}
steps:
  - id: announce
    type: log
    message: "Deploying"
`;

    process.env["REGISTRY_URL"] = "https://registry.example.com";

    try {
      await writeFile(filePath, yaml, "utf8");

      const parsedInline = parsePipelineYaml(yaml);
      const parsedFromFile = await parsePipelineFile(filePath);

      expect(parsedInline.servers?.["registry"]?.url).toBe("https://registry.example.com");
      expect(parsedFromFile.name).toBe("deploy");
    } finally {
      delete process.env["REGISTRY_URL"];
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid pipeline configuration", () => {
    expect(() =>
      parsePipelineYaml(`
name: invalid
steps:
  - id: bad-http
    type: http
    url: https://example.com
    method: TRACE
`)
    ).toThrow("Pipeline configuration is invalid");
  });

  it("compiles graph structure and rejects duplicate step identifiers", () => {
    const config: PipelineConfig = {
      name: "compiled-pipeline",
      version: "1",
      steps: [
        {
          id: "branch",
          type: "condition",
          condition: "approved",
          on_true: "deploy",
          on_false: "skip"
        },
        { id: "deploy", type: "log", message: "Deploying" },
        {
          id: "fanout",
          type: "parallel",
          steps: [
            { id: "child-a", type: "log", message: "A" },
            { id: "child-b", type: "log", message: "B" }
          ]
        },
        { id: "skip", type: "log", message: "Skipping" }
      ]
    };

    const graph = compile(config);

    expect(graph.entryPoints).toEqual(["branch"]);
    expect(graph.edges.get("branch")).toEqual(["deploy", "skip"]);
    expect(graph.groups).toEqual([["branch"], ["deploy"], ["child-a", "child-b"], ["skip"]]);

    expect(() =>
      compile({
        name: "duplicate",
        version: "1",
        steps: [
          {
            id: "parallel",
            type: "parallel",
            steps: [
              { id: "duplicate-id", type: "log", message: "A" },
              { id: "duplicate-id", type: "log", message: "B" }
            ]
          }
        ]
      })
    ).toThrow("Duplicate step id found: duplicate-id");
  });

  it("validates referenced servers and exposes compiled step access", () => {
    const validPipeline = new Pipeline({
      name: "valid",
      version: "1",
      servers: {
        api: { transport: "http", url: "https://api.example.com" }
      },
      steps: [
        {
          id: "call-api",
          server: "api",
          tool: "list",
          input: {}
        }
      ]
    });

    expect(validPipeline.validate()).toEqual({ valid: true, errors: [] });
    expect(validPipeline.getStep("call-api")?.id).toBe("call-api");
    expect(validPipeline.getExecutionOrder()).toEqual([["call-api"]]);

    expect(
      () =>
        new Pipeline({
          name: "invalid",
          version: "1",
          steps: [
            {
              id: "call-api",
              server: "missing",
              tool: "list",
              input: {}
            }
          ]
        }).validate()
    ).toThrow("references undefined server 'missing'");
  });

  it("evaluates conditions and templates with helper functions and graceful failures", () => {
    const evaluator = new ConditionEval();
    const transformer = new Transformer();

    expect(evaluator.evaluate("count > 2", { count: 3 })).toBe(true);
    expect(evaluator.evaluate("missing(", { count: 3 })).toBe(false);

    expect(transformer.transform("Hello {{ uppercase(user.name) }}", { user: { name: "ada" } })).toBe("Hello ADA");
    expect(transformer.transform("{{ labels | includes('bug') }}", { labels: ["bug", "triage"] })).toBe(true);
    expect(String(transformer.transform("{{ invalid() }}", {}))).toContain("[EvalError:");
  });

  it("hydrates run context with vars and resolves server config lookups", () => {
    const ctx = new RunContext(
      "run-1",
      "pipeline-1",
      { region: "eu-west-1" },
      undefined,
      { api: { transport: "http", url: "https://api.example.com" } }
    );

    expect(ctx.dataBus.get("region")).toBe("eu-west-1");
    expect(ctx.getServerConfig("api")).toEqual({ transport: "http", url: "https://api.example.com" });
    expect(() => ctx.getServerConfig("missing")).toThrow("Server config not found for: missing");
  });

  it("persists run records and step records in sqlite", () => {
    const store = new RunStore(":memory:");

    try {
      store.createRun("run-1", "pipeline-1", "Pipeline 1");
      const stepRecordId = store.createStep("run-1", "step-1", "First step");
      store.updateStep(stepRecordId, "success", { ok: true });
      store.updateRun("run-1", "success");

      expect(store.listRuns()).toHaveLength(1);
      expect(store.getRun("run-1")?.status).toBe("success");
      expect(store.getRunSteps("run-1")[0]).toMatchObject({
        status: "success",
        step_id: "step-1"
      });
      expect(store.listPipelines()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("reuses pooled clients, cleans up idle connections, and shuts down the pool", async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const createdClient = { disconnect };
    const createFn = vi.fn().mockResolvedValue(createdClient);
    const pool = new ServerPool(1, 5);

    const first = await pool.acquire("sentinel", createFn);
    pool.release("sentinel", first as never);
    const second = await pool.acquire("sentinel", createFn);

    expect(second).toBe(first);
    expect(createFn).toHaveBeenCalledTimes(1);

    pool.release("sentinel", second as never);
    const entry = ((pool as unknown as { pools: Map<string, Array<{ lastUsed: number }>> }).pools.get("sentinel") ?? [])[0];
    if (!entry) {
      throw new Error("Expected pool entry");
    }
    entry.lastUsed = Date.now() - 10;

    (pool as unknown as { cleanupIdleConnections: () => void }).cleanupIdleConnections();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalled();

    await pool.shutdown();
    vi.clearAllTimers();
  });
});
