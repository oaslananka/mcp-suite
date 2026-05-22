import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { KeyManager } from "../src/auth/KeyManager.js";

describe("KeyManager", () => {
  it("creates, validates, revokes, lists, and rotates virtual keys", () => {
    const manager = new KeyManager(new Database(":memory:"));

    const created = manager.create({
      name: "ci-bot",
      tags: ["ci", "bot"],
      rateLimit: { requestsPerMinute: 60 },
      allowedTools: ["github__*"],
    });

    expect(created.rawKey).toContain("mcp_");
    expect(manager.list()).toEqual([
      expect.objectContaining({
        id: created.id,
        name: "ci-bot",
        tags: ["ci", "bot"],
        rateLimit: { requestsPerMinute: 60 },
        allowedTools: ["github__*"],
      }),
    ]);

    expect(manager.validate(created.rawKey ?? "")).toMatchObject({
      id: created.id,
      name: "ci-bot",
    });

    const rotated = manager.rotate(created.id);
    expect(rotated.oldKey.id).toBe(created.id);
    expect(rotated.newKey.id).not.toBe(created.id);
    expect(manager.validate(created.rawKey ?? "")).toBeNull();
    expect(manager.validate(rotated.newKey.rawKey ?? "")).toMatchObject({
      id: rotated.newKey.id,
      allowedTools: ["github__*"],
    });

    manager.revoke(rotated.newKey.id);
    expect(manager.validate(rotated.newKey.rawKey ?? "")).toBeNull();
  });
});
