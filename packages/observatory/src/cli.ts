#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import { logger } from "@oaslananka/shared";
import { DashboardServer } from "./server/DashboardServer.js";
import { SQLiteStore } from "./storage/SQLiteStore.js";

async function openDatabase(dbPath: string): Promise<Database.Database> {
  const absolutePath = path.resolve(dbPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return new Database(absolutePath);
}

const program = new Command();

program
  .name("observatory")
  .description("Metrics, traces, anomaly detection, and alerting for MCP")
  .version("1.0.0");

program
  .command("serve")
  .description("Start the Observatory dashboard API")
  .option("--port <port>", "Port to listen on", process.env["OBSERVATORY_PORT"] ?? "4006")
  .option("--db <path>", "SQLite database path", process.env["OBSERVATORY_DB_PATH"] ?? "./data/observatory.sqlite")
  .action(async (options: { port: string; db: string }) => {
    const db = await openDatabase(options.db);
    const store = new SQLiteStore(db);
    const server = new DashboardServer(store);
    await server.listen(Number(options.port));
    logger.info({ port: Number(options.port) }, "Observatory dashboard API started");
  });

program
  .command("metrics")
  .description("Query stored metric points")
  .argument("<name>", "Metric name, for example latency or calls")
  .option("--minutes <count>", "How many minutes of history to query", "60")
  .option("--db <path>", "SQLite database path", process.env["OBSERVATORY_DB_PATH"] ?? "./data/observatory.sqlite")
  .action(async (name: string, options: { minutes: string; db: string }) => {
    const db = await openDatabase(options.db);
    const store = new SQLiteStore(db);
    const from = new Date(Date.now() - Number(options.minutes) * 60_000);
    const metrics = store.queryMetrics(name, from, new Date());
    process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
  });

program
  .command("baseline")
  .description("Compute baseline statistics for a metric")
  .argument("<name>", "Metric name")
  .option("--days <count>", "How many days of history to inspect", "7")
  .option("--db <path>", "SQLite database path", process.env["OBSERVATORY_DB_PATH"] ?? "./data/observatory.sqlite")
  .action(async (name: string, options: { days: string; db: string }) => {
    const db = await openDatabase(options.db);
    const store = new SQLiteStore(db);
    const baseline = store.computeBaseline(name, Number(options.days));
    process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Observatory CLI failed");
  process.exitCode = 1;
});
