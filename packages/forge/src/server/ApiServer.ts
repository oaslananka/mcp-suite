import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import type { Server } from "http";
import { ForgeAuthPolicy, type ForgePrincipal } from "./AuthPolicy.js";
import { ForgeWebSocketHub, type ForgeWebSocketOptionsInput } from "./WebSocketHub.js";
import type { ForgeEngine } from "../engine/ForgeEngine.js";
import { PipelineConfigSchema } from "../dsl/schema.js";
import type { RunStore } from "../runtime/RunStore.js";
import { logger } from "@oaslananka/shared";
import path from "path";

export interface ApiServerOptions {
  allowedOrigins?: string[];
  authToken?: string;
  authTokens?: Record<string, ForgePrincipal>;
  jsonBodyLimit?: string;
  rateLimit?: { windowMs: number; max: number };
  webSocket?: ForgeWebSocketOptionsInput;
}

export class ApiServer {
  private app: Express;
  private server: Server | undefined;
  private webSocketHub: ForgeWebSocketHub | undefined;
  private readonly allowedOrigins: string[];
  private readonly authPolicy: ForgeAuthPolicy;
  private readonly webSocketOptions: ForgeWebSocketOptionsInput;
  private readonly jsonBodyLimit: string;
  private readonly rateLimit: { windowMs: number; max: number };
  private readonly requestLog = new Map<string, number[]>();

  constructor(
    private engine: ForgeEngine,
    private store: RunStore,
    options: ApiServerOptions = {}
  ) {
    this.allowedOrigins = options.allowedOrigins ?? splitCsv(process.env["FORGE_ALLOWED_ORIGINS"]);
    const configuredAuthToken = options.authToken ?? process.env["FORGE_API_TOKEN"];
    this.authPolicy = new ForgeAuthPolicy({
      ...(configuredAuthToken ? { authToken: configuredAuthToken } : {}),
      ...(options.authTokens ? { authTokens: options.authTokens } : {}),
    });
    this.webSocketOptions = mergeWebSocketOptions(
      readWebSocketOptionsFromEnvironment(),
      options.webSocket ?? {}
    );
    this.jsonBodyLimit = options.jsonBodyLimit ?? "100kb";
    this.rateLimit = options.rateLimit ?? { windowMs: 60_000, max: 120 };
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(this.enforceCors.bind(this));
    this.app.use(
      cors({
        origin: this.allowedOrigins.length > 0 ? this.allowedOrigins : false,
      })
    );
    this.app.use(express.json({ limit: this.jsonBodyLimit }));
  }

  private setupRoutes(): void {
    const api = express.Router();
    api.use(this.authenticate.bind(this));
    api.use(this.enforceRateLimit.bind(this));

    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok" });
    });

    api.get("/pipelines", (_req: Request, res: Response) => {
      const pipelines = this.store.listPipelines();
      res.json({ pipelines });
    });

    api.post("/pipelines", (req: Request, res: Response) => {
      const parsed = PipelineConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid pipeline config", details: parsed.error.flatten() });
        return;
      }

      const pipeline = this.store.savePipeline(parsed.data);
      res.status(201).json({ status: "saved", pipeline });
    });

    api.get("/pipelines/:id", (req: Request, res: Response) => {
      const pipelineId = req.params["id"];
      if (!pipelineId) {
        res.status(400).json({ error: "Missing pipeline ID" });
        return;
      }

      const pipeline = this.store.getPipeline(pipelineId);
      if (!pipeline) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      res.json({ pipeline });
    });

    api.post("/pipelines/:id/run", async (req: Request, res: Response) => {
      try {
        const pipelineId = req.params["id"];
        if (!pipelineId) {
          res.status(400).json({ error: "Missing pipeline ID" });
          return;
        }

        const body = isUnknownRecord(req.body) ? req.body : {};
        const vars = isStringRecord(body["vars"]) ? body["vars"] : {};
        const pipeline = this.store.getPipeline(pipelineId);
        if (!pipeline) {
          res.status(404).json({ error: "Pipeline not found" });
          return;
        }

        const run = await this.engine.run(pipeline, vars);
        res.json(run);
      } catch (error: unknown) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });

    api.get("/runs", (req: Request, res: Response) => {
      const pipelineId = req.query["pipelineId"] as string;
      const limit = parseInt(req.query["limit"] as string) || 20;
      const runs = this.store.listRuns(pipelineId, limit);
      res.json({ runs });
    });

    api.get("/runs/:id", (req: Request, res: Response) => {
      const id = req.params["id"];
      if (!id) {
        res.status(400).json({ error: "Missing ID" });
        return;
      }
      const run = this.store.getRun(id);
      if (!run) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const steps = this.store.getRunSteps(id);
      res.json({ run, steps });
    });

    this.app.use("/api", api);

    const uiPath = path.join(process.cwd(), "dist", "ui");
    this.app.use(express.static(uiPath));

    this.app.get("*", (_req, res) => {
      res.sendFile(path.join(uiPath, "index.html"), (err) => {
        if (err) {
          res.status(404).send("UI not built yet");
        }
      });
    });

    this.app.use(
      (err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
        logger.error({ err }, "API Error");
        if (err.type === "entity.parse.failed") {
          res.status(400).json({ error: "Malformed JSON body" });
          return;
        }
        if (err.type === "entity.too.large") {
          res.status(413).json({ error: "JSON body exceeds the configured limit" });
          return;
        }
        res.status(500).json({ error: err.message });
      }
    );
  }

  private enforceCors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    if (origin) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  }

  private authenticate(req: Request, res: Response, next: NextFunction): void {
    if (!this.authPolicy.isConfigured()) {
      res.status(503).json({ error: "Forge API token is not configured" });
      return;
    }

    const principal = this.authPolicy.resolveBearer(req.headers.authorization);
    if (!principal) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const requiredScope = req.method === "GET" || req.method === "HEAD" ? "api:read" : "api:write";
    if (!this.authPolicy.hasScope(principal, requiredScope)) {
      res.status(403).json({ error: "Insufficient scope" });
      return;
    }

    next();
  }

  private enforceRateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = `${req.ip}:${req.headers.authorization ?? "anonymous"}`;
    const now = Date.now();
    const windowStart = now - this.rateLimit.windowMs;
    this.pruneRequestLog(windowStart);
    const recent = (this.requestLog.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);
    if (recent.length >= this.rateLimit.max) {
      this.requestLog.set(key, recent);
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    recent.push(now);
    this.requestLog.set(key, recent);
    next();
  }

  private pruneRequestLog(windowStart: number): void {
    for (const [key, timestamps] of this.requestLog) {
      const recent = timestamps.filter((timestamp) => timestamp >= windowStart);
      if (recent.length === 0) {
        this.requestLog.delete(key);
      } else if (recent.length !== timestamps.length) {
        this.requestLog.set(key, recent);
      }
    }
  }

  async listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port);
      this.server = server;
      const onError = (error: Error): void => {
        this.server = undefined;
        reject(error);
      };
      server.once("error", onError);
      server.once("listening", () => {
        server.off("error", onError);
        try {
          this.webSocketHub = new ForgeWebSocketHub(server, this.authPolicy, {
            allowedOrigins: this.allowedOrigins,
            ...this.webSocketOptions,
          });
          logger.info(`Forge API Server listening on port ${port}`);
          resolve();
        } catch (error: unknown) {
          this.server = undefined;
          server.close(() => reject(error));
        }
      });
    });
  }

  async close(): Promise<void> {
    await this.webSocketHub?.close();
    this.webSocketHub = undefined;

    const server = this.server;
    this.server = undefined;
    if (!server) {
      return;
    }

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

  broadcastEvent(category: string, payload: unknown): number {
    return this.webSocketHub?.broadcastEvent(category, payload) ?? 0;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function splitCsv(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function readWebSocketOptionsFromEnvironment(): ForgeWebSocketOptionsInput {
  const result: ForgeWebSocketOptionsInput = {};
  const allowedCategories = splitCsv(process.env["FORGE_WS_ALLOWED_CATEGORIES"]);
  if (allowedCategories.length > 0) {
    result.allowedCategories = allowedCategories;
  }

  const allowMissingOrigin = readBooleanEnvironment("FORGE_WS_ALLOW_MISSING_ORIGIN");
  if (allowMissingOrigin !== undefined) {
    result.allowMissingOrigin = allowMissingOrigin;
  }

  assignPositiveIntegerEnvironment(result, "idleTimeoutMs", "FORGE_WS_IDLE_TIMEOUT_MS");
  assignPositiveIntegerEnvironment(result, "maxConnections", "FORGE_WS_MAX_CONNECTIONS");
  assignPositiveIntegerEnvironment(
    result,
    "maxConnectionsPerPrincipal",
    "FORGE_WS_MAX_CONNECTIONS_PER_PRINCIPAL"
  );
  assignPositiveIntegerEnvironment(result, "maxPayloadBytes", "FORGE_WS_MAX_PAYLOAD_BYTES");
  assignPositiveIntegerEnvironment(result, "maxQueueBytes", "FORGE_WS_MAX_QUEUE_BYTES");
  assignPositiveIntegerEnvironment(result, "maxSubscriptions", "FORGE_WS_MAX_SUBSCRIPTIONS");
  assignPositiveIntegerEnvironment(result, "pingIntervalMs", "FORGE_WS_PING_INTERVAL_MS");

  const messageRateMax = readPositiveIntegerEnvironment("FORGE_WS_MESSAGE_RATE_MAX");
  const messageRateWindowMs = readPositiveIntegerEnvironment("FORGE_WS_MESSAGE_RATE_WINDOW_MS");
  if (messageRateMax !== undefined || messageRateWindowMs !== undefined) {
    result.messageRateLimit = {
      ...(messageRateMax !== undefined ? { max: messageRateMax } : {}),
      ...(messageRateWindowMs !== undefined ? { windowMs: messageRateWindowMs } : {}),
    };
  }

  const path = process.env["FORGE_WS_PATH"];
  if (path) {
    result.path = path;
  }
  return result;
}

function assignPositiveIntegerEnvironment(
  target: ForgeWebSocketOptionsInput,
  key:
    | "idleTimeoutMs"
    | "maxConnections"
    | "maxConnectionsPerPrincipal"
    | "maxPayloadBytes"
    | "maxQueueBytes"
    | "maxSubscriptions"
    | "pingIntervalMs",
  environmentName: string
): void {
  const value = readPositiveIntegerEnvironment(environmentName);
  if (value !== undefined) {
    target[key] = value;
  }
}

function mergeWebSocketOptions(
  environment: ForgeWebSocketOptionsInput,
  configured: ForgeWebSocketOptionsInput
): ForgeWebSocketOptionsInput {
  const messageRateLimit = {
    ...environment.messageRateLimit,
    ...configured.messageRateLimit,
  };
  return {
    ...environment,
    ...configured,
    ...(Object.keys(messageRateLimit).length > 0 ? { messageRateLimit } : {}),
  };
}

function readPositiveIntegerEnvironment(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readBooleanEnvironment(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}
