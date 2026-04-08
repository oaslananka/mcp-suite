import { describe, it, expect } from 'vitest';
import { SchemaMapper } from '../src/generators/SchemaMapper.js';
import protobuf from 'protobufjs';

describe('SchemaMapper', () => {
    it('maps Grpc messages to JSON Schema', () => {
        const mapper = new SchemaMapper();
        
        const Message = new protobuf.Type("TestMessage")
             .add(new protobuf.Field("id", 1, "int32"))
             .add(new protobuf.Field("name", 2, "string"));
             
        const schema = mapper.grpcMessageToJsonSchema(Message);
        
        expect(schema.type).toBe('object');
        expect(schema.properties!['id']!.type).toBe('integer');
        expect(schema.properties!['name']!.type).toBe('string');
    });
});
