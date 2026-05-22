import { spawn } from "node:child_process";
import { assertPublicHttpUrl, logger } from "@oaslananka/shared";
import { ServerStore } from "./ServerStore.js";

export interface HealthCheckResult {
  serverId: string;
  status: "online" | "offline" | "degraded";
  responseMs: number;
}

export class HealthMonitor {
  private intervalId?: NodeJS.Timeout;

  constructor(private store: ServerStore) {}

  async start(intervalMs = 900000): Promise<void> {
    // 15 mins
    this.intervalId = setInterval(() => {
      this.checkAll().catch((e) => logger.error({ err: e }, "Health check failed"));
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async checkAll(): Promise<void> {
    logger.info("Running health checks for all servers");
    const servers = this.store.search("", { verified: true }).items;
    for (const server of servers) {
      await this.checkServer(server.id);
    }
  }

  async checkServer(serverId: string): Promise<HealthCheckResult> {
    const server = this.store.findById(serverId);
    if (!server) throw new Error("Server not found");

    const start = Date.now();
    let status: "online" | "offline" | "degraded" = "offline";

    try {
      if (server.transport?.includes("http") && server.homepage) {
        const url = new URL(server.homepage);
        let target = await assertPublicHttpUrl(`${url.origin}/health`, {
          label: "Health check URL policy",
        });
        for (let redirects = 0; redirects <= 3; redirects += 1) {
          const response = await fetch(target, { method: "GET", redirect: "manual" });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location || redirects === 3) {
              status = "offline";
              break;
            }
            target = await assertPublicHttpUrl(new URL(location, target).toString(), {
              label: "Health check redirect URL policy",
            });
            continue;
          }
          status = response.ok ? "online" : "offline";
          break;
        }
      } else if (server.transport?.includes("stdio")) {
        const child = spawn(process.platform === "win32" ? "cmd" : "sh", [
          process.platform === "win32" ? "/c" : "-lc",
          "echo ok",
        ]);
        await new Promise<void>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code) => {
            if (code === 0) {
              resolve();
              return;
            }
            reject(new Error(`Health probe exited with code ${code}`));
          });
        });
        status = "online";
      } else {
        status = "offline";
      }
    } catch (e: unknown) {
      status = "offline";
      logger.warn({ err: e, serverId }, "Health check failed");
    }

    const responseMs = Date.now() - start;

    this.recordHealthCheck(serverId, status, responseMs);

    return { serverId, status, responseMs };
  }

  getUptime(serverId: string, days: number): number {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.store.db
      .prepare(
        `
                SELECT status FROM health_checks
                WHERE server_id = ? AND created_at >= ?
            `
      )
      .all(serverId, windowStart) as Array<{ status: string }>;

    if (rows.length === 0) {
      return 0;
    }

    const healthy = rows.filter((row) => row.status === "online").length;
    return Number(((healthy / rows.length) * 100).toFixed(2));
  }

  private recordHealthCheck(serverId: string, status: string, responseMs: number): void {
    const stmt = this.store.db.prepare(`
            INSERT INTO health_checks (id, server_id, status, response_ms)
            VALUES (?, ?, ?, ?)
        `);
    stmt.run(Date.now().toString(), serverId, status, responseMs);
  }
}
