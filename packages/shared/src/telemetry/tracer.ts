export enum SpanStatusCode {
    OK = "ok",
    ERROR = "error",
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

class InMemorySpan implements Span {
    private readonly record: SpanRecord;

    constructor(name: string) {
        this.record = {
            name,
            startedAt: Date.now(),
            attributes: {},
            exceptions: [],
        };
    }

    get name(): string {
        return this.record.name;
    }

    get startedAt(): number {
        return this.record.startedAt;
    }

    setAttribute(key: string, value: string | number | boolean): void {
        this.record.attributes[key] = value;
    }

    setStatus(status: SpanStatus): void {
        this.record.status = status;
    }

    recordException(error: Error): void {
        this.record.exceptions.push(error);
    }

    end(): void {
        if (!this.record.endedAt) {
            this.record.endedAt = Date.now();
        }
    }

    snapshot(): SpanRecord {
        return {
            ...this.record,
            attributes: { ...this.record.attributes },
            exceptions: [...this.record.exceptions],
        };
    }
}

export interface Tracer {
    readonly name: string;
    readonly version: string;
    startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
}

class InMemoryTracer implements Tracer {
    constructor(
        public readonly name: string,
        public readonly version: string,
    ) {}

    async startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
        const span = new InMemorySpan(name);
        return fn(span);
    }
}

export const tracer: Tracer = new InMemoryTracer("@oaslananka/shared", "1.0.0");

export async function withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return tracer.startActiveSpan(name, async (span) => {
        try {
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            span.recordException(normalizedError);
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: normalizedError.message,
            });
            throw error;
        } finally {
            span.end();
        }
    });
}
