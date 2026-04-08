import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiServer } from "../src/server/ApiServer.js";

async function withServer<T>(fn: (baseUrl: string, server: ApiServer) => Promise<T>): Promise<T> {
  const engine = {
    run: vi.fn().mockResolvedValue({
      id: "run-1",
      pipelineId: "deploy",
      status: "success"
    })
  };
  const store = {
    listPipelines: vi.fn().mockReturnValue([{ name: "deploy" }]),
    listRuns: vi.fn().mockReturnValue([{ id: "run-1", pipeline_id: "deploy", status: "success" }]),
    getRun: vi.fn().mockImplementation((id: string) => (id === "run-1" ? { id, status: "success" } : null)),
    getRunSteps: vi.fn().mockReturnValue([{ id: "step-1", step_id: "announce", status: "success" }])
  };
  const server = new ApiServer(engine as never, store as never);
  await server.listen(0);

  const address = (server as unknown as { server?: { address: () => { port: number } | string | null } }).server?.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on a TCP port");
  }

  try {
    return await fn(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await server.close();
  }
}

describe("ApiServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves health, pipeline, run, and trigger endpoints", async () => {
    await withServer(async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
      const pipelines = await fetch(`${baseUrl}/api/pipelines`).then((response) => response.json());
      const runs = await fetch(`${baseUrl}/api/runs?pipelineId=deploy&limit=5`).then((response) => response.json());
      const runDetails = await fetch(`${baseUrl}/api/runs/run-1`).then((response) => response.json());
      const triggerRun = await fetch(`${baseUrl}/api/pipelines/deploy/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vars: { region: "eu-west-1" } })
      }).then((response) => response.json());

      expect(health).toEqual({ status: "ok" });
      expect(pipelines.pipelines).toHaveLength(1);
      expect(runs.runs).toHaveLength(1);
      expect(runDetails.run).toMatchObject({ id: "run-1", status: "success" });
      expect(triggerRun).toMatchObject({ pipelineId: "deploy", status: "success" });
    });
  });

  it("returns 404 for missing runs", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/runs/missing`);
      const payload = await response.json();

      expect(response.status).toBe(404);
      expect(payload).toEqual({ error: "Not found" });
    });
  });
});
