import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardServer } from "../src/server/DashboardServer.js";
import { SQLiteStore } from "../src/storage/SQLiteStore.js";

interface ResponseMock {
  setHeader(name: string, value: string): void;
  writeHead(statusCode: number, headers?: Record<string, string>): ResponseMock;
  end(body?: string | Buffer): void;
}

function createResponseCollector(): {
  res: ResponseMock;
  result: () => { statusCode: number; headers: Record<string, string>; body: string };
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = "";

  const res: ResponseMock = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(nextStatusCode, nextHeaders) {
      statusCode = nextStatusCode;
      Object.assign(headers, lowerHeaders(nextHeaders ?? {}));
      return res;
    },
    end(chunk) {
      body = chunk ? chunk.toString() : "";
    },
  };

  return { res, result: () => ({ statusCode, headers, body }) };
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

function createDashboardServer(): DashboardServer {
  return new DashboardServer(new SQLiteStore(new Database(":memory:")));
}

describe("DashboardServer edge behavior", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
  });

  it("serves built UI assets with stable content types", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "observatory-ui-assets-"));
    const uiDir = path.join(rootDir, "dist", "ui");
    await mkdir(uiDir, { recursive: true });
    await writeFile(path.join(uiDir, "index.html"), "<main>fallback</main>", "utf8");
    await writeFile(path.join(uiDir, "app.js"), "console.log('ok')", "utf8");
    await writeFile(path.join(uiDir, "style.css"), "body{}", "utf8");
    await writeFile(path.join(uiDir, "data.json"), '{"ok":true}', "utf8");
    process.chdir(rootDir);

    try {
      const server = createDashboardServer() as unknown as {
        serveUi(pathname: string, res: ResponseMock): Promise<void>;
      };

      await expectAsset(server, "/app.js", "text/javascript; charset=utf-8", "console.log");
      await expectAsset(server, "/style.css", "text/css; charset=utf-8", "body{}");
      await expectAsset(server, "/data.json", "application/json; charset=utf-8", '"ok"');
      await expectAsset(server, "/missing.txt", "text/html; charset=utf-8", "fallback");
      await expectAsset(server, "/%E0%A4%A", "text/html; charset=utf-8", "fallback");
    } finally {
      process.chdir(previousCwd);
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("returns 404 when the UI bundle is absent", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "observatory-no-ui-"));
    process.chdir(rootDir);

    try {
      const server = createDashboardServer() as unknown as {
        serveUi(pathname: string, res: ResponseMock): Promise<void>;
      };
      const response = createResponseCollector();

      await server.serveUi("/", response.res);

      expect(response.result()).toMatchObject({
        statusCode: 404,
        body: "Observatory UI has not been built yet",
      });
    } finally {
      process.chdir(previousCwd);
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("listens idempotently and closes safely", async () => {
    const server = createDashboardServer();

    await expect(server.close()).resolves.toBeUndefined();
    const port = await server.listen(0);
    await expect(server.listen(0)).resolves.toBe(port);
    expect(server.getPort()).toBe(port);
    await expect(server.close()).resolves.toBeUndefined();
    expect(server.getPort()).toBeUndefined();
  });
});

async function expectAsset(
  server: { serveUi(pathname: string, res: ResponseMock): Promise<void> },
  pathname: string,
  contentType: string,
  bodyFragment: string
): Promise<void> {
  const response = createResponseCollector();
  await server.serveUi(pathname, response.res);
  expect(response.result().statusCode).toBe(200);
  expect(response.result().headers["content-type"]).toBe(contentType);
  expect(response.result().body).toContain(bodyFragment);
}
