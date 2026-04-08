import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packBundle, unpackBundle } from "../src/utils/bundle.js";
import { toolSchema, validateSchema } from "../src/utils/validate.js";

describe("bundle and validation utilities", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    });

    it("packs and unpacks a bundle with its manifest", async () => {
        const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-suite-src-"));
        const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-suite-out-"));
        tempRoots.push(sourceDir, outputDir);

        await fs.writeFile(path.join(sourceDir, "index.js"), "console.log('hello');", "utf8");
        const bundlePath = path.join(outputDir, "bundle.zip");

        await packBundle(sourceDir, bundlePath, {
            name: "demo",
            version: "1.0.0",
            description: "demo bundle",
            entrypoint: "index.js",
            mcpVersion: "2025-11-05",
            transport: ["stdio"],
        });

        const extractedDir = path.join(outputDir, "extracted");
        const manifest = await unpackBundle(bundlePath, extractedDir);

        expect(manifest.name).toBe("demo");
        await expect(fs.readFile(path.join(extractedDir, "index.js"), "utf8")).resolves.toContain("hello");
    });

    it("validates tool schemas and throws on invalid shapes", () => {
        const validTool = validateSchema(toolSchema, {
            name: "tool_name",
            description: "Runs a tool",
            inputSchema: {
                type: "object",
                properties: {
                    value: { type: "string" },
                },
            },
        });

        expect(validTool.name).toBe("tool_name");

        expect(() => validateSchema(toolSchema, {
            description: "missing name",
            inputSchema: { type: "object" },
        })).toThrow();
    });
});
