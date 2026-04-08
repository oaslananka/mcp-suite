#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { logger } from "@oaslananka/shared";
import { MCPServerGenerator } from "./generators/MCPServerGenerator.js";
import { OpenAPIParser } from "./parsers/OpenAPIParser.js";
import type { ParsedAPI } from "./parsers/OpenAPIParser.js";

async function parseOpenAPI(input: string): Promise<ParsedAPI> {
  const parser = new OpenAPIParser();
  if (/^https?:\/\//.test(input)) {
    return parser.parseURL(input);
  }
  return parser.parseFile(path.resolve(input));
}

const program = new Command();

program
  .name("bridge")
  .description("Generate MCP servers from API definitions")
  .version("1.0.0");

const generate = program.command("generate").description("Generate code from an API description");

generate
  .command("openapi")
  .argument("<input>", "Local OpenAPI file path or URL")
  .requiredOption("--output <dir>", "Output directory")
  .option("--name <serverName>", "Generated server name", "generated-bridge-server")
  .option("--package-name <packageName>", "Generated package name")
  .action(async (input: string, options: { output: string; name: string; packageName?: string }) => {
    const parsed = await parseOpenAPI(input);
    const generator = new MCPServerGenerator();
    const generated = generator.generate(parsed, {
      serverName: options.name,
      ...(options.packageName ? { packageName: options.packageName } : {})
    });

    const outputDir = path.resolve(options.output);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "index.ts"), generated.serverCode, "utf8");
    await writeFile(path.join(outputDir, "package.json"), generated.packageJson, "utf8");
    await writeFile(path.join(outputDir, "README.md"), generated.readme, "utf8");
    logger.info({ outputDir, endpoints: parsed.endpoints.length }, "Generated MCP server scaffold");
  });

const validate = program.command("validate").description("Validate API descriptions without generating files");

validate
  .command("openapi")
  .argument("<input>", "Local OpenAPI file path or URL")
  .action(async (input: string) => {
    const parsed = await parseOpenAPI(input);
    process.stdout.write(`${JSON.stringify({
      endpoints: parsed.endpoints.length,
      servers: parsed.servers,
      securitySchemes: Object.keys(parsed.securitySchemes)
    }, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Bridge CLI failed");
  process.exitCode = 1;
});
