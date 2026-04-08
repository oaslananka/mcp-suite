import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAPIParser } from "../src/parsers/OpenAPIParser.js";

const OPENAPI_DOCUMENT = `
openapi: 3.1.0
servers:
  - url: https://api.example.com
paths:
  /pets:
    get:
      operationId: listPets
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: ok
    post:
      description: Create a pet
      requestBody:
        required: true
      responses:
        "201":
          description: created
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`;

describe("OpenAPIParser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses YAML content into endpoints, servers, and security schemes", async () => {
    const parser = new OpenAPIParser();

    const parsed = await parser.parseYAML(OPENAPI_DOCUMENT);

    expect(parsed.servers).toEqual(["https://api.example.com"]);
    expect(parsed.securitySchemes).toHaveProperty("bearerAuth");
    expect(parsed.endpoints).toHaveLength(2);
    expect(parsed.endpoints[0]).toMatchObject({
      method: "GET",
      path: "/pets",
      operationId: "listPets",
      description: "List pets"
    });
    expect(parsed.endpoints[1]?.operationId).toBe("post__pets");
  });

  it("loads a document from disk", async () => {
    const parser = new OpenAPIParser();
    const dir = await mkdtemp(join(tmpdir(), "bridge-openapi-"));
    const filePath = join(dir, "openapi.yaml");

    try {
      await writeFile(filePath, OPENAPI_DOCUMENT, "utf8");

      const parsed = await parser.parseFile(filePath);

      expect(parsed.endpoints.map((endpoint) => endpoint.operationId)).toContain("listPets");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads a remote document over fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => OPENAPI_DOCUMENT
      })
    );

    const parser = new OpenAPIParser();
    const parsed = await parser.parseURL("https://registry.example.com/openapi.yaml");

    expect(parsed.endpoints).toHaveLength(2);
  });

  it("throws when the remote document cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => ""
      })
    );

    const parser = new OpenAPIParser();

    await expect(parser.parseURL("https://registry.example.com/openapi.yaml")).rejects.toThrow(
      "Failed to fetch OpenAPI document from https://registry.example.com/openapi.yaml"
    );
  });
});
