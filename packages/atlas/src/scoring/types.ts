export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  has_wiki: boolean;
  license?: { key: string; name: string } | null;
  topics: string[];
}

export interface MCPServerManifest {
  name: string;
  version: string;
  description: string;
  mcp?: {
    tools_count?: number;
  };
}

export interface ScoreResult {
  total: number;
  breakdown: Record<string, number>;
}
