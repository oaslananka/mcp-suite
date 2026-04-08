import { buildSchema, GraphQLEnumType, GraphQLFloat, GraphQLID, GraphQLList, GraphQLNonNull } from "graphql";
import { describe, expect, it } from "vitest";
import { SchemaMapper } from "../src/generators/SchemaMapper.js";

describe("SchemaMapper", () => {
  it("normalizes OpenAPI schemas by removing vendor extensions and handling nullable types", () => {
    const mapper = new SchemaMapper();

    const schema = mapper.openAPIToJsonSchema({
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string", "x-internal": true },
        tags: {
          type: "array",
          items: { type: "string", nullable: true }
        }
      },
      "x-generated-by": "bridge"
    });

    expect(schema).toEqual({
      type: ["object", "null"],
      properties: {
        id: { type: "string" },
        tags: {
          type: "array",
          items: { type: ["string", "null"] }
        }
      }
    });
  });

  it("maps GraphQL scalars, lists, enums, and input types to JSON Schema", () => {
    const mapper = new SchemaMapper();
    const schema = buildSchema(`
      enum Status { READY PAUSED }
      input FilterInput { q: String }
      type Query { id: ID!, rating: Float, values: [String!]!, status: Status }
    `);
    const statusType = schema.getType("Status");
    const filterType = schema.getType("FilterInput");

    const enumSchema = mapper.graphQLTypeToJsonSchema(statusType as GraphQLEnumType);
    const listSchema = mapper.graphQLTypeToJsonSchema(new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLID))));
    const inputSchema = mapper.graphQLTypeToJsonSchema(filterType as never);
    const floatSchema = mapper.graphQLTypeToJsonSchema(GraphQLFloat);

    expect(enumSchema).toEqual({ type: "string", enum: ["READY", "PAUSED"] });
    expect(listSchema).toEqual({ type: "array", items: { type: "string" } });
    expect(inputSchema).toEqual({ type: "object", properties: {} });
    expect(floatSchema).toEqual({ type: "number" });
  });
});
