import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigLoader } from "../src/config/ConfigLoader.js";

describe("ConfigLoader", () => {
  it("loads YAML backend definitions and rejects invalid config payloads", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "composer-config-"));
    const validPath = path.join(tempDir, "composer.yml");
    const invalidPath = path.join(tempDir, "invalid.yml");

    await writeFile(validPath, `
servers:
  github:
    transport: http
    url: https://example.com/mcp
`, "utf8");
    await writeFile(invalidPath, "invalid", "utf8");

    const loader = new ConfigLoader();
    await expect(loader.load(validPath)).resolves.toEqual({
      servers: {
        github: {
          transport: "http",
          url: "https://example.com/mcp",
        },
      },
    });
    await expect(loader.load(invalidPath)).rejects.toThrow("Invalid composer config");
  });
});
