import { ToolCallResult } from "@oaslananka/shared";

interface MockRule {
  match?: Record<string, unknown>;
  response: unknown;
}

interface MockToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  rules: MockRule[];
}

function matchesRule(input: Record<string, unknown>, match: Record<string, unknown> | undefined): boolean {
  if (!match) {
    return true;
  }

  return Object.entries(match).every(([key, expected]) => input[key] === expected);
}

export class MockEngine {
  private readonly tools = new Map<string, MockToolDefinition>();

  addTool(tool: MockToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async evaluate(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool "${toolName}" is not configured.` }]
      };
    }

    const rule = tool.rules.find((candidate) => matchesRule(args, candidate.match));
    if (!rule) {
      return {
        isError: true,
        content: [{ type: "text", text: `No mock rule matched for "${toolName}".` }]
      };
    }

    return {
      isError: false,
      structuredOutput: rule.response,
      content: [{ type: "text", text: JSON.stringify(rule.response) }]
    };
  }
}
