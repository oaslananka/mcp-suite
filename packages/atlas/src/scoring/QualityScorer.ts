import type { CompatMatrix, CommunityMetrics, SecurityScanner } from "./index.js";
import type { GitHubRepo, MCPServerManifest, ScoreResult } from "./types.js";

export interface MCPReadinessScoreProvider {
  getLatestHealth(serverId: string): { readiness: string; capabilityStatus: string } | undefined;
}

export class QualityScorer {
  constructor(
    private readonly securityScanner: SecurityScanner,
    private readonly compatMatrix: CompatMatrix,
    private readonly communityMetrics: CommunityMetrics,
    private readonly readinessProvider?: MCPReadinessScoreProvider
  ) {}

  async calculate(
    repo: GitHubRepo,
    manifest: MCPServerManifest,
    serverId: string
  ): Promise<ScoreResult> {
    const readme = (repo.description?.length ?? 0) > 50 ? 10 : 5;
    const tools = (manifest.mcp?.tools_count ?? 0) > 0 ? 10 : 0;
    const security = await this.securityScanner.score(repo, manifest);
    const compatibility = await this.compatMatrix.score(repo, manifest);
    const community = await this.communityMetrics.score(repo);
    const health = this.readinessProvider?.getLatestHealth(serverId);
    let readiness = 0;
    if (health?.readiness === "ready") {
      readiness = health.capabilityStatus === "verified" ? 10 : 7;
    }

    const breakdown = {
      readme,
      tools,
      security,
      compatibility,
      community,
      readiness,
    };

    return {
      total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      breakdown,
    };
  }
}
