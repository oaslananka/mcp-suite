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
export declare class HealthEndpoint {
    private readonly provider;
    constructor(provider: HealthProvider);
    health(): Promise<HealthStatus>;
    ready(): Promise<HealthStatus>;
    register(app: RouteRegistrar): void;
    private respond;
}
//# sourceMappingURL=HealthEndpoint.d.ts.map