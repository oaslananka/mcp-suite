import { buildSchema, isObjectType, buildClientSchema } from 'graphql';
import type { GraphQLField, GraphQLObjectType, IntrospectionQuery } from 'graphql';

export interface ParsedGraphQLSchema {
    queries: Array<GraphQLField<unknown, unknown>>;
    mutations: Array<GraphQLField<unknown, unknown>>;
    subscriptions: Array<GraphQLField<unknown, unknown>>;
}

export class GraphQLParser {
    parse(sdl: string): ParsedGraphQLSchema {
        const schema = buildSchema(sdl);
        
        return {
            queries: this.extractFields(schema.getQueryType()),
            mutations: this.extractFields(schema.getMutationType()),
            subscriptions: this.extractFields(schema.getSubscriptionType())
        };
    }

    parseIntrospection(introspectionResult: IntrospectionQuery | { data: IntrospectionQuery }): ParsedGraphQLSchema {
        // Build client schema from full introspection query result
        const schema = buildClientSchema(hasIntrospectionData(introspectionResult) ? introspectionResult.data : introspectionResult);
        
        return {
            queries: this.extractFields(schema.getQueryType()),
            mutations: this.extractFields(schema.getMutationType()),
            subscriptions: this.extractFields(schema.getSubscriptionType())
        };
    }

    private extractFields(type: GraphQLObjectType | null | undefined): Array<GraphQLField<unknown, unknown>> {
        if (!type || !isObjectType(type)) return [];
        return Object.values(type.getFields());
    }
}

function hasIntrospectionData(
    value: IntrospectionQuery | { data: IntrospectionQuery },
): value is { data: IntrospectionQuery } {
    return "data" in value;
}
