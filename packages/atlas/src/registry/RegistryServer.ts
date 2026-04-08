import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { SEED_SERVERS } from "./seed.js";
import { ServerStore } from "./ServerStore.js";

interface SubmissionPayload {
  name: string;
  packageName: string;
  description: string;
  author?: string;
  homepage?: string;
  installCommand?: string;
  transport?: Array<"stdio" | "http">;
  tags?: string[];
}

function resolveUiDistDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/ui"),
    path.resolve(process.cwd(), "packages/atlas/dist/ui"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? path.resolve(process.cwd(), "dist/ui");
}

export class RegistryServer {
  private httpServer: Server | undefined;

  constructor(private readonly store: ServerStore) {
    this.store.seed(SEED_SERVERS);
  }

  listen(port = 4300): Promise<number> {
    if (this.httpServer?.listening) {
      return Promise.resolve(this.getPort() ?? port);
    }

    this.httpServer = createServer((req, res) => {
      void this.handle(req, res);
    });

    return new Promise((resolve, reject) => {
      const server = this.httpServer;
      if (!server) {
        reject(new Error("Registry server failed to initialize"));
        return;
      }

      const onError = (error: Error): void => reject(error);
      server.once("error", onError);
      server.listen(port, () => {
        server.off("error", onError);
        resolve(this.getPort() ?? port);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.httpServer) {
      return;
    }

    const server = this.httpServer;
    this.httpServer = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  getPort(): number | undefined {
    const address = this.httpServer?.address();
    return typeof address === "object" && address ? address.port : undefined;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/servers") {
      const query = url.searchParams.get("q") ?? "";
      const verified = url.searchParams.get("verified");
      const tag = url.searchParams.get("tag") ?? undefined;
      const filters = verified === null ? {} : { verified: verified === "true" };
      const result = this.store.search(query, {
        ...filters,
        ...(tag ? { tag } : {}),
      });
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tags") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ tags: this.store.listTags() }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/trending") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ items: this.store.getTrending() }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        status: "ok",
        ...this.store.getStats(),
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/submissions") {
      const payload = await this.readJsonBody<SubmissionPayload>(req);
      const record = this.store.add({
        name: payload.name,
        packageName: payload.packageName,
        version: "latest",
        description: payload.description,
        author: payload.author ?? "community",
        transport: payload.transport ?? ["stdio"],
        tags: payload.tags ?? ["community"],
        installCommand: payload.installCommand ?? `npx -y ${payload.packageName}`,
        ...(payload.homepage ? { homepage: payload.homepage } : {}),
        license: "Apache-2.0",
        verified: false,
        downloads: 0,
        rating: 0,
      });
      res.writeHead(201, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(record));
      return;
    }

    const detailMatch = /^\/api\/servers\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && detailMatch) {
      const serverId = detailMatch[1];
      if (!serverId) {
        res.writeHead(400).end("Missing server id");
        return;
      }

      const record = this.store.findById(serverId);
      if (!record) {
        res.writeHead(404).end("Not found");
        return;
      }

      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(record));
      return;
    }

    await this.serveUi(url.pathname, res);
  }

  private async readJsonBody<T>(req: IncomingMessage): Promise<T> {
    const body = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });

    return JSON.parse(body) as T;
  }

  private async serveUi(pathname: string, res: ServerResponse): Promise<void> {
    const uiDistDir = resolveUiDistDir();

    if (!existsSync(uiDistDir)) {
      res.writeHead(404).end("Atlas UI has not been built yet");
      return;
    }

    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const assetPath = path.resolve(uiDistDir, relativePath);
    const isSafePath = assetPath.startsWith(uiDistDir);

    if (isSafePath && existsSync(assetPath)) {
      const body = await readFile(assetPath);
      res.writeHead(200, { "content-type": this.getContentType(assetPath) });
      res.end(body);
      return;
    }

    const indexHtml = await readFile(path.join(uiDistDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(indexHtml);
  }

  private getContentType(assetPath: string): string {
    if (assetPath.endsWith(".js")) {
      return "text/javascript; charset=utf-8";
    }
    if (assetPath.endsWith(".css")) {
      return "text/css; charset=utf-8";
    }
    if (assetPath.endsWith(".json")) {
      return "application/json; charset=utf-8";
    }
    if (assetPath.endsWith(".svg")) {
      return "image/svg+xml";
    }
    if (assetPath.endsWith(".png")) {
      return "image/png";
    }

    return "text/html; charset=utf-8";
  }
}
