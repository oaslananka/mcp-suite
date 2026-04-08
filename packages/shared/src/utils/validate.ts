import { z } from "zod";

export const toolSchema = z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.object({
        type: z.literal("object"),
        properties: z.record(z.any()).optional(),
        required: z.array(z.string()).optional()
    }).passthrough(),
    annotations: z.object({
        readOnly: z.boolean().optional(),
        destructive: z.boolean().optional(),
        idempotent: z.boolean().optional(),
        openWorld: z.boolean().optional()
    }).optional()
});

export const resourceSchema = z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional()
});

export const promptSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    arguments: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional()
    })).optional()
});

export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}
