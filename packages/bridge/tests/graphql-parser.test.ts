import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import { describe, expect, it } from "vitest";
import { GraphQLParser } from "../src/parsers/GraphQLParser.js";

const SDL = `
  type Query {
    health: String!
    pet(id: ID!): String
  }

  type Mutation {
    createPet(name: String!): String!
  }

  type Subscription {
    petCreated: String!
  }
`;

describe("GraphQLParser", () => {
  it("extracts queries, mutations, and subscriptions from SDL", () => {
    const parser = new GraphQLParser();

    const parsed = parser.parse(SDL);

    expect(parsed.queries.map((field) => field.name)).toEqual(["health", "pet"]);
    expect(parsed.mutations.map((field) => field.name)).toEqual(["createPet"]);
    expect(parsed.subscriptions.map((field) => field.name)).toEqual(["petCreated"]);
  });

  it("parses introspection results with or without the top-level data wrapper", () => {
    const parser = new GraphQLParser();
    const schema = buildSchema(SDL);
    const introspection = graphqlSync({
      schema,
      source: getIntrospectionQuery()
    });

    if (introspection.errors) {
      throw new Error(introspection.errors.map((error) => error.message).join(", "));
    }

    const parsedWithData = parser.parseIntrospection(introspection);
    const parsedWithoutData = parser.parseIntrospection(introspection.data);

    expect(parsedWithData.queries.map((field) => field.name)).toContain("pet");
    expect(parsedWithoutData.mutations.map((field) => field.name)).toContain("createPet");
  });

  it("returns empty arrays when schema roots are missing", () => {
    const parser = new GraphQLParser();

    const parsed = parser.parse("type Query { ping: String }");

    expect(parsed.mutations).toEqual([]);
    expect(parsed.subscriptions).toEqual([]);
  });
});
