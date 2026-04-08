import type { Tool } from "@oaslananka/shared";
import type { ParsedAPI } from "../parsers/OpenAPIParser.js";
import { SchemaMapper } from "./SchemaMapper.js";

export class ToolGenerator {
  constructor(private readonly mapper = new SchemaMapper()) {}

  generate(api: ParsedAPI): Tool[] {
    return api.endpoints.map((endpoint) => ({
      name: endpoint.operationId,
      description: endpoint.description ?? `${endpoint.method} ${endpoint.path}`,
      inputSchema: this.mapper.openAPIToJsonSchema({
        type: "object",
        properties: {}
      })
    }));
  }
}
