#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import { logger } from "@oaslananka/shared";
import { RegistryServer } from "./registry/RegistryServer.js";
import { SEED_SERVERS } from "./registry/seed.js";
import { ServerStore } from "./registry/ServerStore.js";

async function openDatabase(dbPath: string): Promise<Database.Database> {
  const absolutePath = path.resolve(dbPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return new Database(absolutePath);
}

const program = new Command();

program
  .name("atlas")
  .description("Discover, trust, and install MCP servers")
  .version("1.0.0");

program
  .command("serve")
  .description("Start the Atlas registry API")
  .option("--port <port>", "Port to listen on", process.env["ATLAS_PORT"] ?? "4003")
  .option("--db <path>", "SQLite database path", process.env["ATLAS_DB_PATH"] ?? "./data/atlas.sqlite")
  .action(async (options: { port: string; db: string }) => {
    const db = await openDatabase(options.db);
    const store = new ServerStore(db);
    const server = new RegistryServer(store);
    await server.listen(Number(options.port));
    logger.info({ port: Number(options.port) }, "Atlas registry API started");
  });

program
  .command("seed")
  .description("Seed the registry with the built-in MCP server catalog")
  .option("--db <path>", "SQLite database path", process.env["ATLAS_DB_PATH"] ?? "./data/atlas.sqlite")
  .action(async (options: { db: string }) => {
    const db = await openDatabase(options.db);
    const store = new ServerStore(db);
    store.seed(SEED_SERVERS);
    process.stdout.write(`Seeded ${SEED_SERVERS.length} MCP server records\n`);
  });

program
  .command("search")
  .description("Search the Atlas MCP server catalog")
  .argument("[query]", "Search term", "")
  .option("--verified", "Only return verified servers", false)
  .option("--tag <tag>", "Filter by tag")
  .option("--db <path>", "SQLite database path", process.env["ATLAS_DB_PATH"] ?? "./data/atlas.sqlite")
  .action(async (query: string, options: { verified: boolean; tag?: string; db: string }) => {
    const db = await openDatabase(options.db);
    const store = new ServerStore(db);
    const result = store.search(query, {
      ...(options.verified ? { verified: true } : {}),
      ...(options.tag ? { tag: options.tag } : {})
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program
  .command("get")
  .description("Get a single MCP server record by id")
  .argument("<id>", "Registry server identifier")
  .option("--db <path>", "SQLite database path", process.env["ATLAS_DB_PATH"] ?? "./data/atlas.sqlite")
  .action(async (id: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    const store = new ServerStore(db);
    const record = store.findById(id);
    if (!record) {
      throw new Error(`Server "${id}" not found`);
    }
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Atlas CLI failed");
  process.exitCode = 1;
});
