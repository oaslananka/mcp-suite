export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitter?: boolean;
    signal?: AbortSignal;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function createAbortError(): Error {
    return new Error("Retry aborted");
}

async function delayWithSignal(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return;
    }

    if (signal.aborted) {
        throw createAbortError();
    }

    await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            reject(createAbortError());
        };

        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);

        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        jitter = true,
        signal,
        shouldRetry,
        onRetry,
    } = options;

    let attempt = 0;

    while (true) {
        if (signal?.aborted) {
            throw createAbortError();
        }

        try {
            return await operation();
        } catch (err) {
            attempt++;
            const canRetry = shouldRetry ? shouldRetry(err, attempt) : true;
            if (attempt >= maxAttempts || !canRetry) {
                throw toError(err);
            }

            let delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
            if (jitter) {
                delay = delay * (0.5 + Math.random() * 0.5);
            }

            onRetry?.(err, attempt, delay);
            await delayWithSignal(delay, signal);
        }
    }
}
