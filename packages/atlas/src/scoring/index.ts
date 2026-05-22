import { GitHubRepo, MCPServerManifest } from "./types.js";

export class SecurityScanner {
  async score(_repo: GitHubRepo, manifest: MCPServerManifest): Promise<number> {
    return manifest.mcp?.tools_count ? 10 : 5;
  }
}

export class CompatMatrix {
  async score(_repo: GitHubRepo, _manifest: MCPServerManifest): Promise<number> {
    return 10;
  }
}

export class CommunityMetrics {
  async score(repo: GitHubRepo): Promise<number> {
    if (repo.stargazers_count >= 500) {
      return 10;
    }
    if (repo.stargazers_count >= 100) {
      return 7;
    }
    return 4;
  }
}
