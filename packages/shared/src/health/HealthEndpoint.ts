export interface HealthStatus {
    status: "ok" | "degraded" | "error";
    checks?: Record<string, unknown>;
    timestamp: string;
}

export interface HealthProvider {
    health(): Promise<Omit<HealthStatus, "timestamp">> | Omit<HealthStatus, "timestamp">;
    ready(): Promise<Omit<HealthStatus, "timestamp">> | Omit<HealthStatus, "timestamp">;
}

export interface RouteRegistrar {
    get(path: string, handler: (_request: unknown, reply?: RouteReply) => Promise<unknown> | unknown): void;
}

export interface RouteReply {
    status(code: number): RouteReply;
    send(payload: unknown): unknown;
}

export class HealthEndpoint {
    constructor(private readonly provider: HealthProvider) {}

    async health(): Promise<HealthStatus> {
        const status = await this.provider.health();
        return withTimestamp(status);
    }

    async ready(): Promise<HealthStatus> {
        const status = await this.provider.ready();
        return withTimestamp(status);
    }

    register(app: RouteRegistrar): void {
        app.get("/health", async (_request, reply) => this.respond(reply, await this.health()));
        app.get("/ready", async (_request, reply) => this.respond(reply, await this.ready()));
    }

    private respond(reply: RouteReply | undefined, payload: HealthStatus): HealthStatus | unknown {
        if (!reply) {
            return payload;
        }

        const code = payload.status === "ok" ? 200 : 503;
        return reply.status(code).send(payload);
    }
}

function withTimestamp(status: Omit<HealthStatus, "timestamp">): HealthStatus {
    return {
        ...status,
        timestamp: new Date().toISOString(),
    };
}
