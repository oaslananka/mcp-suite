import { describe, expect, it } from "vitest";
import { QualityScorer } from "../src/scoring/QualityScorer.js";
import { CompatMatrix, CommunityMetrics, SecurityScanner } from "../src/scoring/index.js";
import type { GitHubRepo, MCPServerManifest } from "../src/scoring/types.js";

function createRepo(description: string | null): GitHubRepo {
  return {
    id: 1,
    name: "test",
    full_name: "test/test",
    html_url: "",
    description,
    created_at: "",
    updated_at: new Date().toISOString(),
    pushed_at: "",
    stargazers_count: 500,
    has_wiki: true,
    license: { key: "mit", name: "MIT" },
    topics: [],
  };
}

function createManifest(toolsCount?: number): MCPServerManifest {
  return {
    name: "test",
    version: "1",
    description: "",
    ...(toolsCount === undefined ? {} : { mcp: { tools_count: toolsCount } }),
  };
}

function createScorer(health?: { readiness: string; capabilityStatus: string }): QualityScorer {
  return new QualityScorer(
    new SecurityScanner(),
    new CompatMatrix(),
    new CommunityMetrics(),
    health ? { getLatestHealth: () => health } : undefined
  );
}

describe("QualityScorer", () => {
  it("awards full readiness points after verified MCP capability checks", async () => {
    const result = await createScorer({
      readiness: "ready",
      capabilityStatus: "verified",
    }).calculate(
      createRepo("A very long description that exceeds 50 chars to get full points."),
      createManifest(5),
      "server1"
    );

    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown).toMatchObject({ readme: 10, tools: 10, readiness: 10 });
  });

  it("awards partial readiness points when initialization succeeds without tools", async () => {
    const result = await createScorer({
      readiness: "ready",
      capabilityStatus: "not_supported",
    }).calculate(createRepo("Short description"), createManifest(0), "server2");

    expect(result.breakdown).toMatchObject({ readme: 5, tools: 0, readiness: 7 });
  });

  it("does not award readiness points without a successful health record", async () => {
    const result = await createScorer().calculate(createRepo(null), createManifest(), "server3");

    expect(result.breakdown).toMatchObject({ readme: 5, tools: 0, readiness: 0 });
  });
});
