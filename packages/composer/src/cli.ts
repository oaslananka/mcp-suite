#!/usr/bin/env node

import { Command } from "commander";
import { MCPServer, StdioTransport, logger } from "@oaslananka/shared";
import { BackendManager } from "./backends/BackendManager.js";
import { ConfigLoader } from "./config/ConfigLoader.js";
import { ComposerProxy } from "./proxy/ComposerProxy.js";
import { NamespacedTools } from "./proxy/NamespacedTools.js";

async function connectBackends(configPath: string): Promise<{ manager: BackendManager; configLoader: ConfigLoader }> {
  const configLoader = new ConfigLoader();
  const config = await configLoader.load(configPath);
  const manager = new BackendManager();

  for (const [name, backend] of Object.entries(config.servers)) {
    await manager.addBackend(name, backend);
  }

  return { manager, configLoader };
}

const program = new Command();

program
  .name("composer")
  .description("Aggregate multiple MCP servers behind a single MCP endpoint")
  .version("1.0.0");

program
  .command("serve")
  .description("Start the Composer proxy over stdio")
  .option("--config <path>", "Path to composer.yml", process.env["COMPOSER_CONFIG"] ?? "./composer.yml")
  .action(async (options: { config: string }) => {
    const configLoader = new ConfigLoader();
    const config = await configLoader.load(options.config);
    const backendManager = new BackendManager();

    for (const [name, backend] of Object.entries(config.servers)) {
      await backendManager.addBackend(name, backend);
    }

    const server = new MCPServer(new StdioTransport(), {
  serverInfo: { name: "mcp-composer", version: "1.0.0" }
    });

    new ComposerProxy(backendManager, server);
    await server.start();
    logger.info("Composer proxy started on stdio transport");
  });

program
  .command("list-backends")
  .description("Show configured backend connection status")
  .option("--config <path>", "Path to composer.yml", process.env["COMPOSER_CONFIG"] ?? "./composer.yml")
  .action(async (options: { config: string }) => {
    const { manager } = await connectBackends(options.config);
    process.stdout.write(`${JSON.stringify(manager.listClients(), null, 2)}\n`);
  });

program
  .command("list-tools")
  .description("Resolve and print all namespaced tools from every backend")
  .option("--config <path>", "Path to composer.yml", process.env["COMPOSER_CONFIG"] ?? "./composer.yml")
  .action(async (options: { config: string }) => {
    const configLoader = new ConfigLoader();
    const config = await configLoader.load(options.config);
    const manager = new BackendManager();
    const tools = [];

    for (const [name, backend] of Object.entries(config.servers)) {
      await manager.addBackend(name, backend);
      const client = manager.getClient(name);
      if (!client) {
        continue;
      }

      const response = await client.listTools();
      tools.push(...response.tools.map((tool) => NamespacedTools.add(tool, name, "__")));
    }

    process.stdout.write(`${JSON.stringify({ tools }, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Composer CLI failed");
  process.exitCode = 1;
});
