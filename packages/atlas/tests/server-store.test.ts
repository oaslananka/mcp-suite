import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ServerStore } from "../src/registry/ServerStore.js";

describe("ServerStore", () => {
  it("adds, searches, updates, trends, and deletes registry records", () => {
    const store = new ServerStore(new Database(":memory:"));

    const first = store.add({
      name: "GitHub",
      packageName: "@modelcontextprotocol/server-github",
      version: "1.0.0",
      description: "GitHub tools",
      author: "Anthropic",
      transport: ["stdio", "http"],
      tags: ["github", "official"],
      installCommand: "npx -y @modelcontextprotocol/server-github",
      homepage: "https://github.com/modelcontextprotocol/servers",
      license: "MIT",
      verified: true,
      downloads: 50_000,
      rating: 4.8,
    });

    const second = store.add({
      name: "Filesystem",
      packageName: "@modelcontextprotocol/server-filesystem",
      version: "1.0.0",
      description: "Filesystem tools",
      author: "Anthropic",
      transport: ["stdio"],
      tags: ["filesystem"],
      installCommand: "npx -y @modelcontextprotocol/server-filesystem .",
      license: "MIT",
      verified: false,
      downloads: 1_000,
      rating: 4.2,
    });

    expect(store.search("git", { verified: true }).items).toEqual([
      expect.objectContaining({ id: first.id, verified: true }),
    ]);
    expect(store.listTags()).toEqual(["filesystem", "github", "official"]);
    expect(store.getStats()).toEqual({ total: 2, verified: 1, tags: 3 });
    expect(store.getTrending(1)[0]).toMatchObject({ id: first.id });

    const updated = store.update(second.id, {
      verified: true,
      homepage: "https://example.com/filesystem",
      tags: ["filesystem", "community"],
    });

    expect(updated.verified).toBe(true);
    expect(updated.homepage).toBe("https://example.com/filesystem");
    expect(store.findById(second.id)).toMatchObject({
      tags: ["filesystem", "community"],
    });

    store.delete(first.id);
    expect(store.findById(first.id)).toBeNull();
    expect(store.search("", {}).total).toBe(1);
  });
  it("migrates legacy registry and health tables without losing existing records", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE registry_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        package_name TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        transport_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        install_command TEXT NOT NULL,
        config_schema_json TEXT,
        homepage TEXT,
        license TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE health_checks (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        status TEXT NOT NULL,
        response_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO registry_servers VALUES (
        'legacy-server', 'Legacy Server', '@example/legacy', '1.0.0', 'Legacy record',
        'Example', '["http"]', '["legacy"]', 'npx legacy', NULL,
        'https://example.com', 'MIT', 1, 10, 4.0,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);

    const store = new ServerStore(db);
    expect(store.findById("legacy-server")).toMatchObject({
      id: "legacy-server",
      name: "Legacy Server",
    });
    store.update("legacy-server", {
      healthConfig: { transport: "http", url: "https://mcp.example.com/mcp" },
    });
    const checkedAt = new Date("2026-07-20T21:45:00.000Z");
    store.recordHealthCheck("legacy-server", {
      status: "online",
      liveness: "reachable",
      readiness: "ready",
      capabilityStatus: "not_supported",
      responseMs: 12,
      checkedAt,
      lastSuccessfulAt: checkedAt,
      negotiatedProtocolVersion: "2025-11-25",
    });
    expect(store.findById("legacy-server")).toMatchObject({
      healthConfig: { transport: "http" },
      health: { readiness: "ready" },
    });
  });

  it("persists explicit probe configuration and structured readiness history", () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = store.add({
      name: "Remote MCP",
      packageName: "@example/remote-mcp",
      version: "1.0.0",
      description: "Remote MCP endpoint",
      author: "Example",
      transport: ["http"],
      tags: ["remote"],
      installCommand: "npx -y @example/remote-mcp",
      healthConfig: {
        transport: "http",
        url: "https://mcp.example.com/mcp",
        headersFromEnv: { authorization: "REMOTE_MCP_TOKEN" },
      },
      license: "MIT",
      verified: true,
      downloads: 0,
      rating: 0,
    });
    const checkedAt = new Date("2026-07-20T21:30:00.000Z");
    store.recordHealthCheck(server.id, {
      status: "online",
      liveness: "reachable",
      readiness: "ready",
      capabilityStatus: "verified",
      responseMs: 42,
      checkedAt,
      lastSuccessfulAt: checkedAt,
      negotiatedProtocolVersion: "2025-11-25",
      toolCount: 3,
    });

    expect(store.findById(server.id)).toMatchObject({
      healthConfig: { transport: "http", url: "https://mcp.example.com/mcp" },
      health: {
        readiness: "ready",
        capabilityStatus: "verified",
        negotiatedProtocolVersion: "2025-11-25",
        toolCount: 3,
      },
      qualityScore: 40,
    });
    expect(store.getLastSuccessfulAt(server.id)).toEqual(checkedAt);
  });
});
