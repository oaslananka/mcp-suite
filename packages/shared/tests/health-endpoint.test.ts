import { describe, expect, it } from "vitest";
import { HealthEndpoint, type RouteRegistrar, type RouteReply } from "../src/health/HealthEndpoint.js";

describe("HealthEndpoint", () => {
    it("adds timestamps to health responses", async () => {
        const endpoint = new HealthEndpoint({
            health: () => ({ status: "ok", checks: { db: true } }),
            ready: () => ({ status: "degraded", checks: { upstream: false } }),
        });

        const health = await endpoint.health();
        const ready = await endpoint.ready();

        expect(health.status).toBe("ok");
        expect(typeof health.timestamp).toBe("string");
        expect(ready.status).toBe("degraded");
        expect(typeof ready.timestamp).toBe("string");
    });

    it("registers /health and /ready routes and maps degraded status to 503", async () => {
        const handlers = new Map<string, (_request: unknown, reply?: RouteReply) => Promise<unknown> | unknown>();
        const app: RouteRegistrar = {
            get(path, handler) {
                handlers.set(path, handler);
            },
        };

        const endpoint = new HealthEndpoint({
            health: () => ({ status: "ok" }),
            ready: () => ({ status: "degraded" }),
        });

        endpoint.register(app);

        const replyState = { code: 200, payload: undefined as unknown };
        const reply: RouteReply = {
            status(code) {
                replyState.code = code;
                return this;
            },
            send(payload) {
                replyState.payload = payload;
                return payload;
            },
        };

        const healthHandler = handlers.get("/health");
        const readyHandler = handlers.get("/ready");

        expect(healthHandler).toBeDefined();
        expect(readyHandler).toBeDefined();

        await healthHandler?.({}, reply);
        expect(replyState.code).toBe(200);

        await readyHandler?.({}, reply);
        expect(replyState.code).toBe(503);
    });
});
