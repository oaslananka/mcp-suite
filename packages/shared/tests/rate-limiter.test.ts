import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/ratelimit/RateLimiter.js";

describe("RateLimiter", () => {
    it("consumes tokens until capacity is exhausted", () => {
        const limiter = new RateLimiter({
            capacity: 2,
            refillRatePerSecond: 1,
        });

        expect(limiter.consume("user-1")).toBe(true);
        expect(limiter.consume("user-1")).toBe(true);
        expect(limiter.consume("user-1")).toBe(false);
        expect(limiter.peek("user-1").retryAfterMs).toBeGreaterThan(0);
    });

    it("refills tokens over time", () => {
        let now = 0;
        const limiter = new RateLimiter({
            capacity: 2,
            refillRatePerSecond: 2,
            now: () => now,
        });

        limiter.consume("user-1");
        limiter.consume("user-1");
        expect(limiter.consume("user-1")).toBe(false);

        now = 500;
        expect(limiter.peek("user-1").tokens).toBe(1);
        expect(limiter.consume("user-1")).toBe(true);
    });

    it("resets bucket state", () => {
        const limiter = new RateLimiter({
            capacity: 1,
            refillRatePerSecond: 1,
        });

        limiter.consume("user-1");
        expect(limiter.consume("user-1")).toBe(false);

        limiter.reset("user-1");
        expect(limiter.consume("user-1")).toBe(true);
    });
});
