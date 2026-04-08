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
});
