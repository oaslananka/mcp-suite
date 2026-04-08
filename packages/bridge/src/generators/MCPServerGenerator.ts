import type { ParsedAPI } from "../parsers/OpenAPIParser.js";
import { ToolGenerator } from "./ToolGenerator.js";

export interface GeneratedServer {
  serverCode: string;
  packageJson: string;
  readme: string;
}

export interface GeneratorOptions {
  packageName?: string;
  serverName?: string;
}

export class MCPServerGenerator {
  constructor(private readonly toolGenerator = new ToolGenerator()) {}

  generate(api: ParsedAPI, opts: GeneratorOptions = {}): GeneratedServer {
    const tools = this.toolGenerator.generate(api);
    const serverName = opts.serverName ?? "generated-bridge-server";
    const packageName = opts.packageName ?? serverName;

    return {
      serverCode: `export const generatedTools = ${JSON.stringify(tools, null, 2)};\n`,
      packageJson: JSON.stringify(
        {
          name: packageName,
          version: "1.0.0",
          type: "module"
        },
        null,
        2
      ),
      readme: `# ${serverName}\n\nGenerated from an API definition with mcp-suite bridge.\n`
    };
  }
}
