import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OpenAPIParser, type OpenAPIRemoteLoader } from "../src/parsers/OpenAPIParser.js";

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

function remoteResult(
  bodyText = OPENAPI_DOCUMENT,
  overrides: Partial<Awaited<ReturnType<OpenAPIRemoteLoader>>> = {}
): Awaited<ReturnType<OpenAPIRemoteLoader>> {
  return {
    bodyText,
    finalUrl: new URL("https://registry.example.com/openapi.yaml"),
    headers: new Headers({ "content-type": "text/yaml" }) as never,
    ok: true,
    status: 200,
    statusText: "OK",
    ...overrides,
  };
}

describe("OpenAPIParser", () => {
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
      description: "List pets",
    });
    expect(parsed.endpoints[1]?.operationId).toBe("post__pets");
  });

  it("loads a document from disk without using the remote network loader", async () => {
    const remoteLoader = vi.fn<OpenAPIRemoteLoader>();
    const parser = new OpenAPIParser({}, remoteLoader);
    const dir = await mkdtemp(join(tmpdir(), "bridge-openapi-"));
    const filePath = join(dir, "openapi.yaml");

    try {
      await writeFile(filePath, OPENAPI_DOCUMENT, "utf8");

      const parsed = await parser.parseFile(filePath);

      expect(parsed.endpoints.map((endpoint) => endpoint.operationId)).toContain("listPets");
      expect(remoteLoader).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads public JSON and YAML through the shared hardened fetch policy", async () => {
    const remoteLoader = vi.fn<OpenAPIRemoteLoader>().mockResolvedValue(remoteResult());
    const parser = new OpenAPIParser({}, remoteLoader);

    const parsed = await parser.parseURL("https://registry.example.com/openapi.yaml");

    expect(parsed.endpoints).toHaveLength(2);
    expect(remoteLoader).toHaveBeenCalledWith("https://registry.example.com/openapi.yaml", {
      label: "Remote OpenAPI schema policy",
      allowedContentTypes: [
        "application/json",
        "application/yaml",
        "application/x-yaml",
        "text/yaml",
        "text/x-yaml",
        "text/plain",
        "application/vnd.oai.openapi+json",
        "application/vnd.oai.openapi+yaml",
      ],
      maxRedirects: 3,
      maxResponseBytes: 1_000_000,
      timeoutMs: 10_000,
    });
  });

  it("passes exact trusted private hosts as an explicit opt-in", async () => {
    const remoteLoader = vi.fn<OpenAPIRemoteLoader>().mockResolvedValue(remoteResult());
    const parser = new OpenAPIParser(
      { remote: { trustedPrivateHosts: ["schemas.corp.example"] } },
      remoteLoader
    );

    await parser.parseURL("https://schemas.corp.example/openapi.yaml");

    expect(remoteLoader).toHaveBeenCalledWith(
      "https://schemas.corp.example/openapi.yaml",
      expect.objectContaining({ trustedPrivateHosts: ["schemas.corp.example"] })
    );
  });

  it("rejects unsuccessful remote responses without reflecting the input URL", async () => {
    const remoteLoader = vi
      .fn<OpenAPIRemoteLoader>()
      .mockResolvedValue(
        remoteResult("not found", { ok: false, status: 404, statusText: "Not Found" })
      );
    const parser = new OpenAPIParser({}, remoteLoader);
    const target = "https://secret-hostname.example/private/openapi.yaml";

    const failure = parser.parseURL(target);

    await expect(failure).rejects.toThrow("Remote OpenAPI schema request failed with HTTP 404");
    await expect(failure).rejects.not.toThrow(target);
  });

  it("propagates deterministic shared policy failures without retrying unsafely", async () => {
    const remoteLoader = vi
      .fn<OpenAPIRemoteLoader>()
      .mockRejectedValue(new Error("Remote OpenAPI schema policy: private target is not allowed"));
    const parser = new OpenAPIParser({}, remoteLoader);

    await expect(parser.parseURL("https://127.0.0.1/openapi.yaml")).rejects.toThrow(
      /private target is not allowed/i
    );
    expect(remoteLoader).toHaveBeenCalledTimes(1);
  });
});
