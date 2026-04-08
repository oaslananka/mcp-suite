import { Tool } from "@oaslananka/shared";

export class NamespacedTools {
  static add(tool: Tool, backendName: string, separator = "__"): Tool {
    return {
      ...tool,
      name: `${backendName}${separator}${tool.name}`
    };
  }

  static strip(toolName: string, separator = "__"): { backendName: string; toolName: string } {
    const index = toolName.indexOf(separator);
    if (index < 0) {
      throw new Error(`Tool "${toolName}" is missing namespace separator "${separator}"`);
    }

    return {
      backendName: toolName.slice(0, index),
      toolName: toolName.slice(index + separator.length)
    };
  }
}
