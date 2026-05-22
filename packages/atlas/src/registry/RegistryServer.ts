import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { assertPublicHttpUrl, UrlPolicyError } from "@oaslananka/shared";
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

interface RegistryServerOptions {
  submissionBodyLimitBytes?: number;
  submissionRateLimit?: { max: number; windowMs: number };
  submissionToken?: string;
}

function resolveUiDistDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/ui"),
    path.resolve(process.cwd(), "packages/atlas/dist/ui"),
  ];

  return (
    candidates.find((candidate) => existsSync(candidate)) ?? path.resolve(process.cwd(), "dist/ui")
  );
}

export class RegistryServer {
  private httpServer: Server | undefined;
  private readonly submissionBodyLimitBytes: number;
  private readonly submissionRateLimit: { max: number; windowMs: number };
  private readonly submissionRequests = new Map<string, number[]>();
  private readonly submissionToken: string | undefined;

  constructor(
    private readonly store: ServerStore,
    options: RegistryServerOptions = {}
  ) {
    this.submissionBodyLimitBytes = options.submissionBodyLimitBytes ?? 32_768;
    this.submissionRateLimit = options.submissionRateLimit ?? { max: 20, windowMs: 60_000 };
    this.submissionToken = options.submissionToken ?? process.env["ATLAS_SUBMISSION_TOKEN"];
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
      res.end(
        JSON.stringify({
          status: "ok",
          ...this.store.getStats(),
        })
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/submissions") {
      await this.handleSubmission(req, res);
      return;
    }

    const detailMatch = /^\/api\/servers\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && detailMatch) {
      const serverId = detailMatch[1];
      if (!serverId) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Missing server id" }));
        return;
      }

      const record = this.store.findById(serverId);
      if (!record) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(record));
      return;
    }

    await this.serveUi(url.pathname, res);
  }

  private async handleSubmission(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!this.isSubmissionAuthorized(req)) {
        res.writeHead(this.submissionToken ? 401 : 503, {
          "content-type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            error: this.submissionToken ? "Unauthorized" : "Submission token is not configured",
          })
        );
        return;
      }

      if (!this.allowSubmission(req)) {
        res.writeHead(429, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Rate limit exceeded" }));
        return;
      }

      const payload = await this.readJsonBody<SubmissionPayload>(
        req,
        this.submissionBodyLimitBytes
      );
      const validationError = await validateSubmission(payload);
      if (validationError) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: validationError }));
        return;
      }

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
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        res.writeHead(413, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "JSON body exceeds the configured limit" }));
        return;
      }
      if (error instanceof SyntaxError) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Malformed JSON body" }));
        return;
      }
      throw error;
    }
  }

  private isSubmissionAuthorized(req: IncomingMessage): boolean {
    if (!this.submissionToken) {
      return false;
    }

    return req.headers.authorization === `Bearer ${this.submissionToken}`;
  }

  private allowSubmission(req: IncomingMessage): boolean {
    const key = req.socket?.remoteAddress ?? "local";
    const now = Date.now();
    const windowStart = now - this.submissionRateLimit.windowMs;
    this.pruneSubmissionRequests(windowStart);
    const recent = (this.submissionRequests.get(key) ?? []).filter(
      (timestamp) => timestamp >= windowStart
    );
    if (recent.length >= this.submissionRateLimit.max) {
      this.submissionRequests.set(key, recent);
      return false;
    }

    recent.push(now);
    this.submissionRequests.set(key, recent);
    return true;
  }

  private pruneSubmissionRequests(windowStart: number): void {
    for (const [key, timestamps] of this.submissionRequests) {
      const recent = timestamps.filter((timestamp) => timestamp >= windowStart);
      if (recent.length === 0) {
        this.submissionRequests.delete(key);
      } else if (recent.length !== timestamps.length) {
        this.submissionRequests.set(key, recent);
      }
    }
  }

  private async readJsonBody<T>(req: IncomingMessage, maxBytes = 32_768): Promise<T> {
    const body = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        if (Buffer.byteLength(data, "utf8") + Buffer.byteLength(chunk, "utf8") > maxBytes) {
          reject(new BodyTooLargeError());
          req.destroy();
          return;
        }
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

    const assetPath = resolveSafeAssetPath(uiDistDir, pathname);

    if (assetPath && (await isFile(assetPath))) {
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

class BodyTooLargeError extends Error {}

async function validateSubmission(payload: SubmissionPayload): Promise<string | null> {
  if (!payload || typeof payload !== "object") {
    return "Submission body must be a JSON object";
  }
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return "Submission name is required";
  }
  if (typeof payload.packageName !== "string" || payload.packageName.trim().length === 0) {
    return "Submission packageName is required";
  }
  if (typeof payload.description !== "string" || payload.description.trim().length === 0) {
    return "Submission description is required";
  }
  if (
    payload.transport &&
    (!Array.isArray(payload.transport) ||
      payload.transport.some((entry) => entry !== "stdio" && entry !== "http"))
  ) {
    return "Submission transport must contain only stdio or http";
  }
  if (payload.homepage) {
    try {
      await assertPublicHttpUrl(payload.homepage, {
        label: "Submission homepage URL policy",
        resolveDns: false,
      });
    } catch (error) {
      if (error instanceof UrlPolicyError) {
        return error.message;
      }
      throw error;
    }
  }

  return null;
}

function resolveSafeAssetPath(rootDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const assetPath = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, assetPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return assetPath;
  }

  return null;
}

async function isFile(assetPath: string): Promise<boolean> {
  try {
    return (await stat(assetPath)).isFile();
  } catch {
    return false;
  }
}
