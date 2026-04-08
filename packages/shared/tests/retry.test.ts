import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "../src/utils/retry.js";

describe("withRetry", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("retries until the operation succeeds", async () => {
        let attempts = 0;

        const result = await withRetry(async () => {
            attempts += 1;
            if (attempts < 3) {
                throw new Error("transient");
            }
            return "ok";
        }, {
            maxAttempts: 4,
            baseDelayMs: 1,
            jitter: false,
        });

        expect(result).toBe("ok");
        expect(attempts).toBe(3);
    });

    it("stops retrying when shouldRetry returns false", async () => {
        let attempts = 0;

        await expect(withRetry(async () => {
            attempts += 1;
            throw new Error("fatal");
        }, {
            maxAttempts: 5,
            baseDelayMs: 1,
            jitter: false,
            shouldRetry: () => false,
        })).rejects.toThrow("fatal");

        expect(attempts).toBe(1);
    });

    it("aborts while waiting for the next retry", async () => {
        vi.useFakeTimers();
        const controller = new AbortController();

        const promise = withRetry(async () => {
            throw new Error("keep failing");
        }, {
            maxAttempts: 3,
            baseDelayMs: 100,
            jitter: false,
            signal: controller.signal,
        });
        const observed = promise.catch((error) => error);

        setTimeout(() => controller.abort(), 10);
        await vi.advanceTimersByTimeAsync(10);

        await expect(observed).resolves.toBeInstanceOf(Error);
        const error = await observed;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Retry aborted");
    });
});
