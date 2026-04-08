export interface RateLimiterOptions {
    capacity: number;
    refillRatePerSecond: number;
    now?: () => number;
}

export interface RateLimitState {
    tokens: number;
    capacity: number;
    refillRatePerSecond: number;
    retryAfterMs: number;
}

interface BucketState {
    tokens: number;
    lastRefillAt: number;
}

export class RateLimiter {
    private readonly capacity: number;
    private readonly refillRatePerSecond: number;
    private readonly now: () => number;
    private readonly buckets = new Map<string, BucketState>();

    constructor(options: RateLimiterOptions) {
        this.capacity = options.capacity;
        this.refillRatePerSecond = options.refillRatePerSecond;
        this.now = options.now ?? (() => Date.now());
    }

    peek(key: string): RateLimitState {
        const bucket = this.getBucket(key);
        return {
            tokens: bucket.tokens,
            capacity: this.capacity,
            refillRatePerSecond: this.refillRatePerSecond,
            retryAfterMs: bucket.tokens >= 1 ? 0 : this.computeRetryAfterMs(bucket.tokens),
        };
    }

    consume(key: string, cost = 1): boolean {
        const bucket = this.getBucket(key);
        if (bucket.tokens < cost) {
            return false;
        }

        bucket.tokens -= cost;
        this.buckets.set(key, bucket);
        return true;
    }

    reset(key: string): void {
        this.buckets.delete(key);
    }

    private getBucket(key: string): BucketState {
        const currentTime = this.now();
        const existing = this.buckets.get(key) ?? { tokens: this.capacity, lastRefillAt: currentTime };
        const elapsedSeconds = Math.max(0, (currentTime - existing.lastRefillAt) / 1000);
        const replenishedTokens = elapsedSeconds * this.refillRatePerSecond;
        const nextState = {
            tokens: Math.min(this.capacity, existing.tokens + replenishedTokens),
            lastRefillAt: currentTime,
        };
        this.buckets.set(key, nextState);
        return nextState;
    }

    private computeRetryAfterMs(tokens: number): number {
        const missingTokens = Math.max(0, 1 - tokens);
        if (missingTokens === 0) {
            return 0;
        }

        return Math.ceil((missingTokens / this.refillRatePerSecond) * 1000);
    }
}
