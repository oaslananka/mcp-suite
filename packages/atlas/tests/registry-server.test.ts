import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PassThrough } from "stream";
import { describe, expect, it } from "vitest";
import { RegistryServer } from "../src/registry/RegistryServer.js";
import { ServerStore } from "../src/registry/ServerStore.js";

function createResponseCollector(): {
  res: {
    setHeader: (name: string, value: string) => void;
    writeHead: (
      statusCode: number,
      headers?: Record<string, string>
    ) => {
      setHeader: (name: string, value: string) => void;
      writeHead: (statusCode: number, headers?: Record<string, string>) => unknown;
      end: (body?: string | Buffer) => void;
    };
    end: (body?: string | Buffer) => void;
  };
  result: () => { statusCode: number; headers: Record<string, string>; body: string };
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";
  let res!: {
    setHeader: (name: string, value: string) => void;
    writeHead: (
      statusCode: number,
      headers?: Record<string, string>
    ) => {
      setHeader: (name: string, value: string) => void;
      writeHead: (statusCode: number, headers?: Record<string, string>) => unknown;
      end: (body?: string | Buffer) => void;
    };
    end: (body?: string | Buffer) => void;
  };

  res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(nextStatusCode, nextHeaders) {
      statusCode = nextStatusCode;
      if (nextHeaders) {
        Object.assign(
          headers,
          Object.fromEntries(
            Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
          )
        );
      }
      return res;
    },
    end(chunk) {
      body = chunk ? chunk.toString() : "";
    },
  };

  return {
    res,
    result: () => ({ statusCode, headers, body }),
  };
}

function createJsonRequest(
  method: string,
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {}
): PassThrough & { headers: Record<string, string>; method: string; url: string } {
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    method: string;
    url: string;
  };
  req.method = method;
  req.url = url;
  req.headers = headers;

  if (payload !== undefined) {
    queueMicrotask(() => {
      req.end(JSON.stringify(payload));
    });
  }

  return req;
}

async function withTemporaryCwd<T>(
  setup: (rootDir: string) => Promise<void>,
  run: () => Promise<T>
): Promise<T> {
  const previousCwd = process.cwd();
  const rootDir = await mkdtemp(path.join(tmpdir(), "atlas-ui-"));
  await setup(rootDir);
  process.chdir(rootDir);

  try {
    return await run();
  } finally {
    process.chdir(previousCwd);
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function invokeHandle(
  server: RegistryServer,
  req: { method?: string; url?: string } | (PassThrough & { method: string; url: string }),
  res: ReturnType<typeof createResponseCollector>["res"]
): Promise<void> {
  await (
    server as unknown as { handle: (request: unknown, response: unknown) => Promise<void> }
  ).handle(req, res);
}

describe("RegistryServer", () => {
  const submissionHeaders = { authorization: "Bearer atlas-token" };

  it("serves search, detail, tags, health, and submission endpoints", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = new RegistryServer(store, {
      submissionToken: "atlas-token",
      submissionBodyLimitBytes: 512,
    });

    const searchResponse = createResponseCollector();
    await invokeHandle(
      server,
      { method: "GET", url: "/api/servers?q=github&verified=true&tag=official" },
      searchResponse.res
    );
    const searchPayload = JSON.parse(searchResponse.result().body) as {
      items: Array<{ name: string }>;
    };
    expect(searchPayload.items.some((item) => item.name.toLowerCase().includes("github"))).toBe(
      true
    );

    const tagsResponse = createResponseCollector();
    await invokeHandle(server, { method: "GET", url: "/api/tags" }, tagsResponse.res);
    const tagsPayload = JSON.parse(tagsResponse.result().body) as { tags: string[] };
    expect(tagsPayload.tags.length).toBeGreaterThan(0);

    const submissionResponse = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest(
        "POST",
        "/api/submissions",
        {
          name: "Team Registry",
          packageName: "@oaslananka/team-registry",
          description: "Internal registry helper",
          transport: ["http"],
          homepage: "https://registry.example.com",
        },
        submissionHeaders
      ),
      submissionResponse.res
    );
    const submissionPayload = JSON.parse(submissionResponse.result().body) as { id: string };
    expect(submissionResponse.result().statusCode).toBe(201);

    const detailResponse = createResponseCollector();
    await invokeHandle(
      server,
      { method: "GET", url: `/api/servers/${submissionPayload.id}` },
      detailResponse.res
    );
    expect(JSON.parse(detailResponse.result().body)).toMatchObject({
      name: "Team Registry",
      homepage: "https://registry.example.com",
    });

    const healthResponse = createResponseCollector();
    await invokeHandle(server, { method: "GET", url: "/health" }, healthResponse.res);
    expect(JSON.parse(healthResponse.result().body)).toMatchObject({
      status: "ok",
    });
  });

  it("handles missing urls and unknown server lookups", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = new RegistryServer(store);

    const missingUrlResponse = createResponseCollector();
    await invokeHandle(server, { method: "GET" }, missingUrlResponse.res);
    expect(missingUrlResponse.result()).toMatchObject({
      statusCode: 400,
      body: "Missing URL",
    });

    const missingRecordResponse = createResponseCollector();
    await invokeHandle(
      server,
      { method: "GET", url: "/api/servers/not-found" },
      missingRecordResponse.res
    );
    expect(missingRecordResponse.result()).toMatchObject({
      statusCode: 404,
      body: JSON.stringify({ error: "Not found" }),
    });
  });

  it("serves built UI assets and falls back to index html for app routes", async () => {
    await withTemporaryCwd(
      async (rootDir) => {
        const uiDir = path.join(rootDir, "dist", "ui");
        await mkdir(uiDir, { recursive: true });
        await writeFile(
          path.join(uiDir, "index.html"),
          "<html><body>Atlas UI</body></html>",
          "utf8"
        );
        await writeFile(path.join(uiDir, "app.js"), "console.log('atlas-ui');", "utf8");
      },
      async () => {
        const store = new ServerStore(new Database(":memory:"));
        const server = new RegistryServer(store);

        const assetResponse = createResponseCollector();
        await invokeHandle(server, { method: "GET", url: "/app.js" }, assetResponse.res);
        expect(assetResponse.result()).toMatchObject({
          statusCode: 200,
          body: "console.log('atlas-ui');",
        });
        expect(assetResponse.result().headers["content-type"]).toBe(
          "text/javascript; charset=utf-8"
        );

        const routeResponse = createResponseCollector();
        await invokeHandle(server, { method: "GET", url: "/servers/demo" }, routeResponse.res);
        expect(routeResponse.result().statusCode).toBe(200);
        expect(routeResponse.result().body).toContain("Atlas UI");
        expect(routeResponse.result().headers["content-type"]).toBe("text/html; charset=utf-8");
      }
    );
  });

  it("does not serve sibling-prefix or encoded traversal paths outside the UI bundle", async () => {
    await withTemporaryCwd(
      async (rootDir) => {
        const uiDir = path.join(rootDir, "dist", "ui");
        const siblingDir = path.join(rootDir, "dist", "ui-evil");
        await mkdir(uiDir, { recursive: true });
        await mkdir(siblingDir, { recursive: true });
        await writeFile(
          path.join(uiDir, "index.html"),
          "<html><body>Atlas UI</body></html>",
          "utf8"
        );
        await writeFile(path.join(siblingDir, "secret.txt"), "sibling secret", "utf8");
        await mkdir(path.join(uiDir, "assets"), { recursive: true });
      },
      async () => {
        const store = new ServerStore(new Database(":memory:"));
        const server = new RegistryServer(store);

        for (const traversalPath of ["../ui-evil/secret.txt", "/%2e%2e/ui-evil/secret.txt"]) {
          const response = createResponseCollector();
          await (
            server as unknown as {
              serveUi: (
                pathname: string,
                res: ReturnType<typeof createResponseCollector>["res"]
              ) => Promise<void>;
            }
          ).serveUi(traversalPath, response.res);

          expect(response.result().statusCode).toBe(200);
          expect(response.result().body).toContain("Atlas UI");
          expect(response.result().body).not.toContain("sibling secret");
        }

        const directoryResponse = createResponseCollector();
        await (
          server as unknown as {
            serveUi: (
              pathname: string,
              res: ReturnType<typeof createResponseCollector>["res"]
            ) => Promise<void>;
          }
        ).serveUi("/assets", directoryResponse.res);

        expect(directoryResponse.result().statusCode).toBe(200);
        expect(directoryResponse.result().body).toContain("Atlas UI");
      }
    );
  });

  it("requires authenticated, schema-valid submissions with public HTTPS homepages", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = new RegistryServer(store, {
      submissionToken: "atlas-token",
      submissionBodyLimitBytes: 256,
    });

    const unauthorized = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest("POST", "/api/submissions", {
        name: "No Auth",
        packageName: "@oaslananka/no-auth",
        description: "missing auth",
      }),
      unauthorized.res
    );

    const invalid = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest(
        "POST",
        "/api/submissions",
        {
          name: "Invalid",
          description: "missing package name",
        },
        submissionHeaders
      ),
      invalid.res
    );

    const privateHomepage = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest(
        "POST",
        "/api/submissions",
        {
          name: "Private",
          packageName: "@oaslananka/private",
          description: "private URL",
          transport: ["http"],
          homepage: "http://127.0.0.1:8080",
        },
        submissionHeaders
      ),
      privateHomepage.res
    );

    const oversized = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest(
        "POST",
        "/api/submissions",
        {
          name: "Oversized",
          packageName: "@oaslananka/oversized",
          description: "x".repeat(256),
        },
        submissionHeaders
      ),
      oversized.res
    );

    expect(unauthorized.result().statusCode).toBe(401);
    expect(invalid.result().statusCode).toBe(400);
    expect(privateHomepage.result().statusCode).toBe(400);
    expect(oversized.result().statusCode).toBe(413);
  });

  it("prunes stale submission rate-limit entries before recording new submissions", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = new RegistryServer(store, {
      submissionToken: "atlas-token",
      submissionBodyLimitBytes: 512,
    });
    const submissionRequests = (server as unknown as { submissionRequests: Map<string, number[]> })
      .submissionRequests;
    submissionRequests.set("stale-client", [0]);

    const response = createResponseCollector();
    await invokeHandle(
      server,
      createJsonRequest(
        "POST",
        "/api/submissions",
        {
          name: "Fresh",
          packageName: "@oaslananka/fresh",
          description: "Fresh submission",
        },
        submissionHeaders
      ),
      response.res
    );

    expect(response.result().statusCode).toBe(201);
    expect(submissionRequests.has("stale-client")).toBe(false);
  });

  it("returns 404 when the UI bundle has not been built", async () => {
    await withTemporaryCwd(
      async () => Promise.resolve(),
      async () => {
        const store = new ServerStore(new Database(":memory:"));
        const server = new RegistryServer(store);

        const response = createResponseCollector();
        await invokeHandle(server, { method: "GET", url: "/" }, response.res);

        expect(response.result()).toMatchObject({
          statusCode: 404,
          body: "Atlas UI has not been built yet",
        });
      }
    );
  });

  it("listens on an ephemeral port and closes cleanly", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const server = new RegistryServer(store);

    await server.close();
    expect(server.getPort()).toBeUndefined();

    const port = await server.listen(0);
    expect(port).toBeGreaterThan(0);
    expect(server.getPort()).toBe(port);
    expect(await server.listen(0)).toBe(port);

    const response = await fetch(`http://127.0.0.1:${port}/api/trending`);
    expect(response.ok).toBe(true);
    const payload = (await response.json()) as { items: Array<{ id: string }> };
    expect(payload.items.length).toBeGreaterThan(0);

    await server.close();
    expect(server.getPort()).toBeUndefined();
  });
});
