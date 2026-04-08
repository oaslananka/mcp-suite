export interface ToolRoute {
  backendName: string;
  toolName: string;
}

export class ToolRouter {
  constructor(private readonly separator = "__") {}

  route(namespacedToolName: string): ToolRoute {
    const index = namespacedToolName.indexOf(this.separator);
    if (index < 0) {
      throw new Error(`Unable to resolve backend for tool "${namespacedToolName}"`);
    }

    return {
      backendName: namespacedToolName.slice(0, index),
      toolName: namespacedToolName.slice(index + this.separator.length)
    };
  }
}
