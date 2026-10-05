export declare enum SpanStatusCode {
    OK = "ok",
    ERROR = "error"
}
export interface SpanStatus {
    code: SpanStatusCode;
    message?: string;
}
export interface SpanRecord {
    name: string;
    startedAt: number;
    endedAt?: number;
    status?: SpanStatus;
    attributes: Record<string, string | number | boolean>;
    exceptions: Error[];
}
export interface Span {
    readonly name: string;
    readonly startedAt: number;
    setAttribute(key: string, value: string | number | boolean): void;
    setStatus(status: SpanStatus): void;
    recordException(error: Error): void;
    end(): void;
    snapshot(): SpanRecord;
}
export interface Tracer {
    readonly name: string;
    readonly version: string;
    startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
}
export declare const tracer: Tracer;
export declare function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
//# sourceMappingURL=tracer.d.ts.map