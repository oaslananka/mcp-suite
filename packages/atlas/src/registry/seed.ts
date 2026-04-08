import { MCPServerRecord } from "./ServerStore.js";

const now = new Date();

interface SeedInput {
  id: string;
  name: string;
  packageName: string;
  description: string;
  author: string;
  tags: string[];
  verified: boolean;
  downloads: number;
  rating: number;
  homepage?: string;
  transport?: Array<"stdio" | "http">;
}

function createSeed(input: SeedInput): MCPServerRecord {
  return {
    id: input.id,
    name: input.name,
    packageName: input.packageName,
    version: "latest",
    description: input.description,
    author: input.author,
    transport: input.transport ?? ["stdio"],
    tags: input.tags,
    installCommand: `npx -y ${input.packageName}`,
    ...(input.homepage ? { homepage: input.homepage } : {}),
    license: "MIT",
    verified: input.verified,
    downloads: input.downloads,
    rating: input.rating,
    createdAt: now,
    updatedAt: now,
  };
}

export const SEED_SERVERS: MCPServerRecord[] = [
  createSeed({ id: "filesystem", name: "Filesystem", packageName: "@modelcontextprotocol/server-filesystem", description: "Read and write local files over MCP.", author: "Anthropic", tags: ["filesystem", "official"], verified: true, downloads: 120000, rating: 4.9, homepage: "https://github.com/modelcontextprotocol/servers" }),
  createSeed({ id: "github", name: "GitHub", packageName: "@modelcontextprotocol/server-github", description: "Repos, issues, pull requests, and code search via MCP.", author: "Anthropic", tags: ["github", "vcs", "official"], verified: true, downloads: 110000, rating: 4.8, homepage: "https://github.com/modelcontextprotocol/servers" }),
  createSeed({ id: "git", name: "Git", packageName: "@modelcontextprotocol/server-git", description: "Inspect repositories and local history through MCP tools.", author: "Anthropic", tags: ["git", "vcs", "official"], verified: true, downloads: 84000, rating: 4.7 }),
  createSeed({ id: "postgres", name: "Postgres", packageName: "@modelcontextprotocol/server-postgres", description: "Query and inspect PostgreSQL databases from MCP clients.", author: "Anthropic", tags: ["database", "sql", "official"], verified: true, downloads: 92000, rating: 4.7, transport: ["stdio", "http"] }),
  createSeed({ id: "sqlite", name: "SQLite", packageName: "@modelcontextprotocol/server-sqlite", description: "Lightweight SQL access for local SQLite databases.", author: "Anthropic", tags: ["database", "sqlite", "official"], verified: true, downloads: 65000, rating: 4.6 }),
  createSeed({ id: "memory", name: "Memory", packageName: "@modelcontextprotocol/server-memory", description: "Persistent memory primitives for local agent workflows.", author: "Anthropic", tags: ["memory", "official"], verified: true, downloads: 70000, rating: 4.6 }),
  createSeed({ id: "fetch", name: "Fetch", packageName: "@modelcontextprotocol/server-fetch", description: "HTTP fetch with MCP-friendly result shaping.", author: "Anthropic", tags: ["http", "web", "official"], verified: true, downloads: 88000, rating: 4.7, transport: ["stdio", "http"] }),
  createSeed({ id: "brave-search", name: "Brave Search", packageName: "@modelcontextprotocol/server-brave-search", description: "Web and news search backed by Brave Search.", author: "Anthropic", tags: ["search", "web", "official"], verified: true, downloads: 76000, rating: 4.5 }),
  createSeed({ id: "puppeteer", name: "Puppeteer", packageName: "@modelcontextprotocol/server-puppeteer", description: "Browser automation and page inspection tools.", author: "Anthropic", tags: ["browser", "automation", "official"], verified: true, downloads: 73000, rating: 4.6 }),
  createSeed({ id: "slack", name: "Slack", packageName: "@modelcontextprotocol/server-slack", description: "Search channels and post messages through Slack APIs.", author: "Anthropic", tags: ["chat", "slack", "official"], verified: true, downloads: 51000, rating: 4.3 }),
  createSeed({ id: "notion", name: "Notion", packageName: "@modelcontextprotocol/server-notion", description: "Query pages and databases from Notion workspaces.", author: "Anthropic", tags: ["knowledge-base", "notion", "official"], verified: true, downloads: 49000, rating: 4.4 }),
  createSeed({ id: "google-drive", name: "Google Drive", packageName: "@modelcontextprotocol/server-google-drive", description: "Browse and retrieve Google Drive documents.", author: "Anthropic", tags: ["files", "google-workspace", "official"], verified: true, downloads: 46000, rating: 4.3 }),
  createSeed({ id: "gmail", name: "Gmail", packageName: "@modelcontextprotocol/server-gmail", description: "Search threads and draft email actions for Gmail.", author: "Anthropic", tags: ["email", "google-workspace", "official"], verified: true, downloads: 42000, rating: 4.2 }),
  createSeed({ id: "google-calendar", name: "Google Calendar", packageName: "@modelcontextprotocol/server-google-calendar", description: "Calendar lookups and scheduling actions via MCP.", author: "Anthropic", tags: ["calendar", "google-workspace", "official"], verified: true, downloads: 39000, rating: 4.2 }),
  createSeed({ id: "redis", name: "Redis", packageName: "@modelcontextprotocol/server-redis", description: "Inspect keys and cached state in Redis instances.", author: "Anthropic", tags: ["cache", "database", "official"], verified: true, downloads: 33000, rating: 4.1 }),
  createSeed({ id: "aws-s3", name: "AWS S3", packageName: "@modelcontextprotocol/server-s3", description: "List buckets and inspect object metadata.", author: "Anthropic", tags: ["cloud", "storage", "official"], verified: true, downloads: 32000, rating: 4.1 }),
  createSeed({ id: "jira", name: "Jira", packageName: "@modelcontextprotocol/server-jira", description: "Issue search, transitions, and comments for Jira.", author: "Anthropic", tags: ["project-management", "atlassian"], verified: true, downloads: 31000, rating: 4.0 }),
  createSeed({ id: "confluence", name: "Confluence", packageName: "@modelcontextprotocol/server-confluence", description: "Search and retrieve Confluence content.", author: "Anthropic", tags: ["knowledge-base", "atlassian"], verified: true, downloads: 29000, rating: 4.0 }),
  createSeed({ id: "docker", name: "Docker", packageName: "@modelcontextprotocol/server-docker", description: "Inspect images, containers, and compose workloads.", author: "Anthropic", tags: ["containers", "devops"], verified: true, downloads: 27000, rating: 4.0 }),
  createSeed({ id: "kubernetes", name: "Kubernetes", packageName: "@modelcontextprotocol/server-kubernetes", description: "Cluster inspection and workload debugging tools.", author: "Anthropic", tags: ["kubernetes", "devops"], verified: true, downloads: 25000, rating: 4.0 }),
  createSeed({ id: "stripe", name: "Stripe", packageName: "@modelcontextprotocol/server-stripe", description: "Read payment, customer, and subscription data safely.", author: "Anthropic", tags: ["payments", "business"], verified: true, downloads: 24000, rating: 4.1 }),
  createSeed({ id: "shopify", name: "Shopify", packageName: "@modelcontextprotocol/server-shopify", description: "Storefront and order queries for Shopify stores.", author: "Anthropic", tags: ["commerce", "storefront"], verified: true, downloads: 22000, rating: 4.0 }),
  createSeed({ id: "linear", name: "Linear", packageName: "@modelcontextprotocol/server-linear", description: "Issues, projects, and team workflows for Linear.", author: "Anthropic", tags: ["project-management", "issues"], verified: true, downloads: 21000, rating: 4.2 }),
  createSeed({ id: "sentry", name: "Sentry", packageName: "@modelcontextprotocol/server-sentry", description: "Inspect exceptions and releases from Sentry.", author: "Anthropic", tags: ["observability", "errors"], verified: true, downloads: 20000, rating: 4.1 }),
  createSeed({ id: "playwright", name: "Playwright", packageName: "@executeautomation/playwright-mcp-server", description: "Browser automation for acceptance checks and scraping.", author: "ExecuteAutomation", tags: ["browser", "automation", "community"], verified: false, downloads: 34000, rating: 4.4, homepage: "https://github.com/executeautomation/mcp-playwright" }),
  createSeed({ id: "context7", name: "Context7", packageName: "@upstash/context7-mcp", description: "Live library and framework documentation for coding agents.", author: "Upstash", tags: ["docs", "retrieval", "community"], verified: false, downloads: 48000, rating: 4.6, homepage: "https://github.com/upstash/context7" }),
  createSeed({ id: "firecrawl", name: "Firecrawl", packageName: "firecrawl-mcp", description: "Crawl, extract, and structure web data through MCP.", author: "Firecrawl", tags: ["web", "crawl", "community"], verified: false, downloads: 28000, rating: 4.3, homepage: "https://github.com/mendableai/firecrawl-mcp-server" }),
  createSeed({ id: "cloudflare", name: "Cloudflare", packageName: "@cloudflare/mcp-server-cloudflare", description: "Control Workers, KV, D1, and account resources.", author: "Cloudflare", tags: ["cloud", "edge", "community"], verified: false, downloads: 23000, rating: 4.2, homepage: "https://github.com/cloudflare/mcp-server-cloudflare" }),
  createSeed({ id: "mcp-ssh-tool", name: "SSH Tool", packageName: "mcp-ssh-tool", description: "Remote automation through SSH with MCP controls.", author: "oaslananka", tags: ["ssh", "devops", "automation"], verified: true, downloads: 12000, rating: 4.4, homepage: "https://www.npmjs.com/package/mcp-ssh-tool" }),
  createSeed({ id: "browserbase", name: "Browserbase", packageName: "@browserbasehq/mcp-server-browserbase", description: "Cloud browser sessions and automation flows.", author: "Browserbase", tags: ["browser", "cloud", "community"], verified: false, downloads: 17000, rating: 4.1, homepage: "https://github.com/browserbase/mcp-server-browserbase" }),
  createSeed({ id: "perplexity", name: "Perplexity", packageName: "@perplexity-ai/mcp-server", description: "Search-augmented answers and citations via MCP.", author: "Perplexity", tags: ["search", "llm", "community"], verified: false, downloads: 15000, rating: 4.0, homepage: "https://github.com/perplexityai/mcp-server" }),
];
