import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { Installer } from "../src/installer/Installer.js";
import { Indexer } from "../src/registry/Indexer.js";
import { ServerStore } from "../src/registry/ServerStore.js";

describe("Installer and Indexer", () => {
  it("creates install snippets and rebuild counts from the registry", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const serverRecord = store.add({
      name: "Filesystem",
      packageName: "@modelcontextprotocol/server-filesystem",
      version: "1.0.0",
      description: "Filesystem access",
      author: "Anthropic",
      transport: ["stdio"],
      tags: ["filesystem"],
      installCommand: "npx -y @modelcontextprotocol/server-filesystem .",
      license: "MIT",
      verified: true,
      downloads: 2_500,
      rating: 4.7,
    });

    const installer = new Installer();
    const result = await installer.install(serverRecord, ".");

    expect(result.success).toBe(true);
    expect(result.configSnippet).toContain("@modelcontextprotocol/server-filesystem");
    expect(result.verificationResult.ok).toBe(true);

    await expect(installer.uninstall(serverRecord)).resolves.toBeUndefined();
    await expect(installer.upgrade(serverRecord)).resolves.toBeUndefined();

    const indexer = new Indexer(store);
    expect(indexer.rebuild()).toEqual({ count: 1 });
  });
});
