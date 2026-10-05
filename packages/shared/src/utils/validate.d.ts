import { z } from "zod";
export declare const toolSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    inputSchema: z.ZodObject<{
        type: z.ZodLiteral<"object">;
        properties: z.ZodOptional<z.ZodRecord<z.ZodAny, z.core.SomeType>>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$loose>;
    annotations: z.ZodOptional<z.ZodObject<{
        readOnly: z.ZodOptional<z.ZodBoolean>;
        destructive: z.ZodOptional<z.ZodBoolean>;
        idempotent: z.ZodOptional<z.ZodBoolean>;
        openWorld: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const resourceSchema: z.ZodObject<{
    uri: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    mimeType: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const promptSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    arguments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T;
//# sourceMappingURL=validate.d.ts.map