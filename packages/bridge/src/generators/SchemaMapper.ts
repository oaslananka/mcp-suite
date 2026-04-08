import type { JSONSchema7, JSONSchemaType } from '@oaslananka/shared';
import { isNonNullType, isListType, isScalarType, isEnumType } from 'graphql';
import type { GraphQLType } from 'graphql';
import protobuf from 'protobufjs';

export class SchemaMapper {
    openAPIToJsonSchema(schema: Record<string, unknown>): JSONSchema7 {
        if (!schema) return { type: 'object' };

        const clone = structuredClone(schema) as Record<string, unknown>;
        return this.normalizeSchema(clone);
    }

    graphQLTypeToJsonSchema(type: GraphQLType, _inputTypes?: Map<string, unknown>): JSONSchema7 {
        if (isNonNullType(type)) {
            return this.graphQLTypeToJsonSchema(type.ofType);
        }
        
        if (isListType(type)) {
            return {
                type: 'array',
                items: this.graphQLTypeToJsonSchema(type.ofType)
            };
        }

        if (isScalarType(type)) {
            switch (type.name) {
                case 'Int': return { type: 'integer' };
                case 'Float': return { type: 'number' };
                case 'Boolean': return { type: 'boolean' };
                case 'String': return { type: 'string' };
                case 'ID': return { type: 'string' };
                default: return { type: 'string' };
            }
        }

        if (isEnumType(type)) {
            return {
                type: 'string',
                enum: type.getValues().map(v => v.name)
            };
        }

        if (type.name && type.name.endsWith('Input')) {
            return { type: 'object', properties: {} };
        }

        return { type: 'string' };
    }

    grpcMessageToJsonSchema(message: protobuf.Type): JSONSchema7 {
        const schema: JSONSchema7 = { type: 'object', properties: {} };
        for (const [name, field] of Object.entries(message.fields)) {
            let type: string;
            switch (field.type) {
                case 'double': case 'float': type = 'number'; break;
                case 'int32': case 'int64': case 'uint32': case 'uint64': case 'sint32': case 'sint64':
                case 'fixed32': case 'fixed64': case 'sfixed32': case 'sfixed64': type = 'integer'; break;
                case 'bool': type = 'boolean'; break;
                case 'string': type = 'string'; break;
                default: type = 'object';
            }
            if (schema.properties) {
                 schema.properties[name] = { type: type as JSONSchemaType };
            }
        }
        return schema;
    }

    private normalizeSchema(schema: Record<string, unknown>): JSONSchema7 {
        if (schema["nullable"] === true && typeof schema["type"] === "string") {
            schema["type"] = [schema["type"], "null"];
        }

        delete schema["nullable"];

        for (const key of Object.keys(schema)) {
            if (key.startsWith("x-")) {
                delete schema[key];
                continue;
            }

            const value = schema[key];
            if (Array.isArray(value)) {
                schema[key] = value.map((item) =>
                    item && typeof item === "object" ? this.normalizeSchema(item) : item
                );
                continue;
            }

            if (value && typeof value === "object") {
                schema[key] = this.normalizeSchema(value as Record<string, unknown>);
            }
        }

        return schema as JSONSchema7;
    }
}
