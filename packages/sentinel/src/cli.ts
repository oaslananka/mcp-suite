#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import { StdioTransport, logger } from "@oaslananka/shared";
import { ApprovalGate } from "./approval/ApprovalGate.js";
import { AuditLog } from "./audit/AuditLog.js";
import { KeyManager } from "./auth/KeyManager.js";
import { detectPII, redactPII } from "./pii/PIIDetector.js";
import { RequestPipeline } from "./proxy/RequestPipeline.js";
import { ResponsePipeline } from "./proxy/ResponsePipeline.js";
import { SentinelProxy } from "./proxy/SentinelProxy.js";

async function openDatabase(dbPath: string): Promise<Database.Database> {
  const absolutePath = path.resolve(dbPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return new Database(absolutePath);
}

const program = new Command();

program
  .name("sentinel")
  .description("Zero-Trust MCP security layer")
  .version("1.0.0");

program
  .command("proxy")
  .description("Start the Sentinel MCP proxy over stdio")
  .option("--db <path>", "SQLite database path", process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite")
  .option("--upstream-url <url>", "HTTP upstream MCP endpoint", process.env["SENTINEL_UPSTREAM_URL"])
  .option("--upstream-command <command>", "stdio upstream command", process.env["SENTINEL_UPSTREAM_COMMAND"])
  .action(async (options: { db: string; upstreamUrl?: string; upstreamCommand?: string }) => {
    if (!options.upstreamUrl && !options.upstreamCommand) {
      throw new Error("Either --upstream-url or --upstream-command is required.");
    }

    const db = await openDatabase(options.db);
    const keyManager = new KeyManager(db);
    const proxy = new SentinelProxy(
      {
        ...(options.upstreamUrl ? { upstreamUrl: options.upstreamUrl } : {}),
        ...(options.upstreamCommand ? { upstreamCommand: options.upstreamCommand } : {})
      },
      new RequestPipeline(),
      new ResponsePipeline(),
      new AuditLog(db),
      new ApprovalGate(),
      new StdioTransport(),
      keyManager
    );

    await proxy.start();
    logger.info("Sentinel proxy started on stdio transport");
  });

const keys = program.command("keys").description("Manage Sentinel virtual keys");

keys
  .command("create")
  .requiredOption("--name <name>", "Friendly name for the virtual key")
  .option("--tag <tag...>", "Tags to associate with the key")
  .option("--allow-tool <pattern...>", "Allowed tool glob patterns")
  .option("--rpm <number>", "Requests per minute rate limit")
  .option("--expires-at <timestamp>", "Optional ISO expiry timestamp")
  .option("--db <path>", "SQLite database path", process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite")
  .action(async (options: { name: string; tag?: string[]; allowTool?: string[]; rpm?: string; expiresAt?: string; db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    const key = manager.create({
      name: options.name,
      ...(options.tag ? { tags: options.tag } : {}),
      ...(options.allowTool ? { allowedTools: options.allowTool } : {}),
      ...(options.rpm ? { rateLimit: { requestsPerMinute: Number(options.rpm) } } : {}),
      ...(options.expiresAt ? { expiresAt: new Date(options.expiresAt) } : {})
    });
    process.stdout.write(`${JSON.stringify(key, null, 2)}\n`);
  });

keys
  .command("list")
  .option("--db <path>", "SQLite database path", process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite")
  .action(async (options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    process.stdout.write(`${JSON.stringify(manager.list(), null, 2)}\n`);
  });

keys
  .command("revoke")
  .argument("<id>", "Virtual key identifier")
  .option("--db <path>", "SQLite database path", process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite")
  .action(async (id: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    manager.revoke(id);
    process.stdout.write(`Revoked key ${id}\n`);
  });

keys
  .command("rotate")
  .argument("<id>", "Virtual key identifier")
  .option("--db <path>", "SQLite database path", process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite")
  .action(async (id: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    const rotated = manager.rotate(id);
    process.stdout.write(`${JSON.stringify(rotated, null, 2)}\n`);
  });

program
  .command("pii-scan")
  .description("Detect and optionally redact PII from input text")
  .argument("[text]", "Inline text to scan")
  .option("--file <path>", "Read text from a file instead of an inline argument")
  .option("--redact", "Emit redacted output as well", false)
  .action(async (text: string | undefined, options: { file?: string; redact: boolean }) => {
    const source = options.file ? await readFile(path.resolve(options.file), "utf8") : text ?? "";
    const matches = detectPII(source);
    const result = {
      matches,
      redacted: options.redact ? redactPII(source) : undefined
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Sentinel CLI failed");
  process.exitCode = 1;
});
