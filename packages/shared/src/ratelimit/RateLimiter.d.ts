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
export declare class RateLimiter {
    private readonly capacity;
    private readonly refillRatePerSecond;
    private readonly now;
    private readonly buckets;
    constructor(options: RateLimiterOptions);
    peek(key: string): RateLimitState;
    consume(key: string, cost?: number): boolean;
    reset(key: string): void;
    private getBucket;
    private computeRetryAfterMs;
}
//# sourceMappingURL=RateLimiter.d.ts.map