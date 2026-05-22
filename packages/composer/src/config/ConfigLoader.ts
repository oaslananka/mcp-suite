import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export interface BackendConfig {
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface ComposerConfig {
  servers: Record<string, BackendConfig>;
  routing?: {
    tool_prefix?: boolean;
    conflict_resolution?: "first_match" | "error" | "merge";
  };
}

export class ConfigLoader {
  async load(filePath: string): Promise<ComposerConfig> {
    const absolutePath = path.resolve(filePath);
    const raw = await readFile(absolutePath, "utf8");
    const parsed = yaml.load(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Invalid composer config: ${absolutePath}`);
    }

    return parsed as ComposerConfig;
  }
}
