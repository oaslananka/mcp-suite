import pino from "pino";

export function createLogger(bindings: Record<string, unknown> = {}): pino.Logger {
    return pino({
        level: process.env["LOG_LEVEL"] ?? "info",
        timestamp: pino.stdTimeFunctions.isoTime,
        ...(process.env["NODE_ENV"] === "development"
            ? {
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                    },
                },
            }
            : {}),
        formatters: {
            level: (label) => ({ level: label }),
            bindings: () => bindings,
        },
    });
}

export const logger = createLogger();

export type Logger = pino.Logger;
