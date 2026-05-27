import type { Page, Route } from "@playwright/test";

export type SurfaceId = "atlas" | "observatory" | "lab";

export interface Surface {
  id: SurfaceId;
  name: string;
  url: string;
  heading: RegExp;
  thresholds: {
    domContentLoadedMs: number;
    loadMs: number;
  };
}

export const surfaces: Surface[] = [
  {
    id: "atlas",
    name: "Atlas",
    url: "http://127.0.0.1:4173",
    heading: /Find MCP servers/i,
    thresholds: {
      domContentLoadedMs: 1_500,
      loadMs: 2_500,
    },
  },
  {
    id: "observatory",
    name: "Observatory",
    url: "http://127.0.0.1:4174",
    heading: /Track latency/i,
    thresholds: {
      domContentLoadedMs: 1_800,
      loadMs: 3_000,
    },
  },
  {
    id: "lab",
    name: "Lab",
    url: "http://127.0.0.1:4175",
    heading: /Model Context Protocol Lab/i,
    thresholds: {
      domContentLoadedMs: 1_800,
      loadMs: 3_000,
    },
  },
];

export function getSurface(id: SurfaceId): Surface {
  const surface = surfaces.find((candidate) => candidate.id === id);

  if (!surface) {
    throw new Error(`Unknown UI surface: ${id}`);
  }

  return surface;
}

const atlasServers = [
  {
    id: "filesystem",
    name: "Filesystem MCP",
    description: "Read and write approved local workspace paths.",
    author: "Model Context Protocol",
    packageName: "@modelcontextprotocol/server-filesystem",
    tags: ["filesystem", "storage"],
    verified: true,
    downloads: 12_450,
    qualityScore: 96,
    installCommand: "npx -y @modelcontextprotocol/server-filesystem .",
  },
  {
    id: "browser",
    name: "Browser MCP",
    description: "Drive browser automation from MCP clients.",
    author: "Playwright Team",
    packageName: "@playwright/mcp",
    tags: ["browser", "automation", "testing"],
    verified: true,
    downloads: 8_640,
    qualityScore: 92,
    installCommand: "npx -y @playwright/mcp",
  },
];

const labConnection = {
  id: "mock-lab",
  name: "Mock MCP Server",
  type: "stdio" as const,
  endpoint: "npx -y @modelcontextprotocol/server-everything",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-everything"],
  favorite: true,
  createdAt: "2026-05-27T00:00:00.000Z",
};

const labTools = [
  {
    name: "list_tools",
    description: "Return available tool contracts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_resource",
    description: "Read a resource by URI.",
    inputSchema: {
      type: "object",
      properties: {
        uri: { type: "string" },
      },
    },
  },
];

export async function prepareSurface(page: Page, surface: Surface): Promise<void> {
  if (surface.id === "atlas") {
    await mockAtlasApi(page);
    return;
  }

  if (surface.id === "observatory") {
    await mockObservatoryApi(page);
    return;
  }

  await mockLabApi(page);
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
}

async function mockAtlasApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/tags") {
      await fulfillJson(route, { tags: ["filesystem", "browser", "automation", "testing"] });
      return;
    }

    if (url.pathname === "/api/trending") {
      await fulfillJson(route, { items: atlasServers });
      return;
    }

    if (url.pathname === "/api/servers") {
      const items = searchAtlas(url);
      await fulfillJson(route, {
        items,
        total: items.length,
      });
      return;
    }

    if (url.pathname.startsWith("/api/servers/")) {
      const serverId = url.pathname.replace("/api/servers/", "");
      await fulfillJson(
        route,
        atlasServers.find((server) => server.id === serverId)
      );
      return;
    }

    if (url.pathname === "/api/submissions") {
      const body = route.request().postDataJSON() as Partial<(typeof atlasServers)[number]>;
      await fulfillJson(route, {
        ...atlasServers[0],
        id: "submitted-server",
        name: body.name ?? "Submitted MCP Server",
        packageName: body.packageName ?? "@example/submitted-mcp",
        description: body.description ?? "Submitted from browser test.",
        tags: Array.isArray(body.tags) ? body.tags : ["submission"],
        verified: false,
        downloads: 0,
        qualityScore: 70,
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Unknown Atlas API route" });
  });
}

function searchAtlas(url: URL): typeof atlasServers {
  const query = url.searchParams.get("q")?.toLowerCase() ?? "";
  const tag = url.searchParams.get("tag");
  const verifiedOnly = url.searchParams.get("verified") === "true";

  return atlasServers.filter((server) => {
    const matchesQuery =
      !query ||
      server.name.toLowerCase().includes(query) ||
      server.description.toLowerCase().includes(query) ||
      server.tags.some((serverTag) => serverTag.includes(query));
    const matchesTag = !tag || server.tags.includes(tag);
    const matchesVerified = !verifiedOnly || server.verified;

    return matchesQuery && matchesTag && matchesVerified;
  });
}

async function mockObservatoryApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/dashboard") {
      await fulfillJson(route, {
        p99Latency: 243.1,
        errorRate: 0.0024,
        callVolume: 12_804,
        errorBudget: {
          status: "healthy",
          budgetRemaining: 87,
        },
      });
      return;
    }

    if (url.pathname === "/api/metrics") {
      await fulfillJson(route, {
        items: [
          { name: "latency", value: 210, timestamp: "2026-05-27T00:00:00.000Z" },
          { name: "latency", value: 243, timestamp: "2026-05-27T00:05:00.000Z" },
        ],
      });
      return;
    }

    if (url.pathname === "/api/traces") {
      await fulfillJson(route, {
        items: [
          {
            traceId: "trace-001",
            spanId: "span-001",
            name: "tools/list",
            startTime: "2026-05-27T00:00:00.000Z",
            endTime: "2026-05-27T00:00:00.243Z",
          },
        ],
      });
      return;
    }

    if (url.pathname === "/api/anomalies") {
      await fulfillJson(route, {
        items: [
          {
            id: "anomaly-001",
            severity: "high",
            title: "Latency spike",
            message: "P99 latency crossed the smoke threshold.",
            createdAt: "2026-05-27T00:01:00.000Z",
          },
        ],
      });
      return;
    }

    if (url.pathname === "/api/alerts") {
      await fulfillJson(route, {
        items: [
          {
            id: "alert-001",
            severity: "medium",
            title: "Error budget watch",
            message: "Remaining budget is below the weekly target.",
            createdAt: "2026-05-27T00:02:00.000Z",
          },
        ],
      });
      return;
    }

    await route.fulfill({ status: 404, body: "Unknown Observatory API route" });
  });
}

async function mockLabApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ connection, tools }) => {
      let connected = false;
      let savedConnections = [connection];

      Object.defineProperty(window, "labApi", {
        configurable: true,
        value: {
          async connectServer(opts) {
            connected = true;
            const nextConnection = {
              ...connection,
              name: opts.name || connection.name,
              type: opts.type,
              endpoint:
                opts.type === "http"
                  ? opts.url
                  : [opts.command, ...(opts.args ?? [])].filter(Boolean).join(" "),
              command: opts.command,
              args: opts.args ?? [],
              favorite: false,
            };
            savedConnections = [nextConnection];

            return {
              success: true,
              error: undefined,
              connection: nextConnection,
              capabilities: { tools: true, resources: true, prompts: true },
              serverInfo: { name: "Mock MCP Server", version: "1.0.0" },
            };
          },
          async disconnectServer() {
            connected = false;
            return { success: true };
          },
          async getServerInfo() {
            return {
              connected,
              connection: connected ? savedConnections[0] : undefined,
              capabilities: connected ? { tools: true, resources: true, prompts: true } : undefined,
              serverInfo: connected ? { name: "Mock MCP Server", version: "1.0.0" } : undefined,
            };
          },
          async listConnections() {
            return savedConnections;
          },
          async deleteConnection() {
            savedConnections = [];
            return { success: true };
          },
          async deleteAllConnections() {
            const deleted = savedConnections.length;
            savedConnections = [];
            return { success: true, deleted };
          },
          async setFavoriteConnection(id, favorite) {
            savedConnections = savedConnections.map((savedConnection) =>
              savedConnection.id === id ? { ...savedConnection, favorite } : savedConnection
            );
            return savedConnections.find((savedConnection) => savedConnection.id === id) ?? null;
          },
          async listTools() {
            return { tools };
          },
          async callTool(name, args) {
            return {
              result: { name, args, ok: true },
              latency: 12,
            };
          },
          async listResources() {
            return {
              resources: [{ uri: "file:///workspace/README.md", name: "README" }],
            };
          },
          async readResource(uri) {
            return { uri, text: "resource contents" };
          },
          async subscribeResource(uri) {
            return { uri, subscribed: true };
          },
          async listPrompts() {
            return {
              prompts: [{ name: "summarize", description: "Summarize selected context." }],
            };
          },
          async getPrompt(name, args) {
            return { name, args, messages: [] };
          },
          async listHistory() {
            return [];
          },
          async listCollections() {
            return [];
          },
          async startMock(config) {
            return { config, running: true };
          },
          async stopMock() {
            return { running: false };
          },
          async getSettings() {
            return {};
          },
        },
      });
    },
    { connection: labConnection, tools: labTools }
  );
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: body === undefined ? 404 : 200,
    contentType: "application/json",
    body: JSON.stringify(body ?? { error: "Not found" }),
  });
}
