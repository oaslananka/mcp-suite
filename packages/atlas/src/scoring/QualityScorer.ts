import { CompatMatrix, CommunityMetrics, SecurityScanner } from "./index.js";
import { GitHubRepo, MCPServerManifest, ScoreResult } from "./types.js";

export class QualityScorer {
  constructor(
    private readonly securityScanner: SecurityScanner,
    private readonly compatMatrix: CompatMatrix,
    private readonly communityMetrics: CommunityMetrics
  ) {}

  async calculate(repo: GitHubRepo, manifest: MCPServerManifest, _serverId: string): Promise<ScoreResult> {
    const readme = (repo.description?.length ?? 0) > 50 ? 10 : 5;
    const tools = (manifest.mcp?.tools_count ?? 0) > 0 ? 10 : 0;
    const security = await this.securityScanner.score(repo, manifest);
    const compatibility = await this.compatMatrix.score(repo, manifest);
    const community = await this.communityMetrics.score(repo);

    const breakdown = {
      readme,
      tools,
      security,
      compatibility,
      community
    };

    return {
      total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      breakdown
    };
  }
}
