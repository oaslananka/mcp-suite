import { z } from "zod";

export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("webhook"), path: z.string() }),
  z.object({ type: z.literal("cron"), schedule: z.string() }),
  z.object({ type: z.literal("manual") })
]);

export const RetrySchema = z.object({
  max_attempts: z.number().int().min(1).max(10),
  backoff: z.enum(["linear", "exponential", "fixed"]),
  initial_delay_ms: z.number().optional()
});

export type StepConfig =
  | { id: string; name?: string | undefined; type?: "tool" | undefined; server: string; tool: string; input: Record<string, unknown>; output_as?: string | undefined; retry?: z.infer<typeof RetrySchema> | undefined; timeout?: string | undefined; }
  | { id: string; name?: string | undefined; type: "condition"; condition: string; on_true: string; on_false: string; output_as?: string | undefined; }
  | { id: string; name?: string | undefined; type: "parallel"; steps: StepConfig[]; output_as?: string | undefined; }
  | { id: string; name?: string | undefined; type: "loop"; over: string; as: string; steps: StepConfig[]; output_as?: string | undefined; }
  | { id: string; name?: string | undefined; type: "delay"; duration: string; output_as?: string | undefined; }
  | { id: string; name?: string | undefined; type: "http"; url: string; method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE"; headers?: Record<string, string> | undefined; body?: unknown; output_as?: string | undefined; }
  | { id: string; name?: string | undefined; type: "log"; message: string; level?: "debug"|"info"|"warn"|"error" | undefined; output_as?: string | undefined; };

export const StepSchema: z.ZodType<StepConfig> = z.lazy(() => z.union([
  // Tool call step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("tool").optional(),
    server: z.string(),
    tool: z.string(),
    input: z.record(z.unknown()),
    output_as: z.string().optional(),
    retry: RetrySchema.optional(),
    timeout: z.string().optional()
  }),
  // Condition step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("condition"),
    condition: z.string(),
    on_true: z.string(),
    on_false: z.string(),
    output_as: z.string().optional()
  }),
  // Parallel step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("parallel"),
    steps: z.array(z.lazy(() => StepSchema)),
    output_as: z.string().optional()
  }),
  // Loop step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("loop"),
    over: z.string(),
    as: z.string(),
    steps: z.array(z.lazy(() => StepSchema)),
    output_as: z.string().optional()
  }),
  // Delay step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("delay"),
    duration: z.string(),
    output_as: z.string().optional()
  }),
  // HTTP step (non-MCP)
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("http"),
    url: z.string(),
    method: z.enum(["GET","POST","PUT","PATCH","DELETE"]),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
    output_as: z.string().optional()
  }),
  // Log step
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.literal("log"),
    message: z.string(),
    level: z.enum(["debug","info","warn","error"]).optional(),
    output_as: z.string().optional()
  })
]));

export const ServerConfigSchema = z.object({
    url: z.string().optional(),
    command: z.string().optional(),
    transport: z.enum(["http", "stdio"]),
    auth: z.object({
      type: z.enum(["bearer", "api-key", "basic"]),
      token: z.string().optional(),
      header: z.string().optional(),
      value: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional()
    }).optional(),
    timeout: z.string().optional()
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const PipelineConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  servers: z.record(ServerConfigSchema).optional(),
  triggers: z.array(TriggerSchema).optional(),
  steps: z.array(StepSchema),
  on_error: z.object({
    server: z.string(),
    tool: z.string(),
    input: z.record(z.unknown())
  }).optional()
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
