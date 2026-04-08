export interface CounterMetric {
    readonly name: string;
    readonly description: string;
    add(value?: number): void;
    value(): number;
}

export interface HistogramMetric {
    readonly name: string;
    readonly description: string;
    record(value: number): void;
    snapshot(): { count: number; min: number; max: number; sum: number; average: number };
}

class InMemoryCounter implements CounterMetric {
    private total = 0;

    constructor(public readonly name: string, public readonly description: string) {}

    add(value = 1): void {
        this.total += value;
    }

    value(): number {
        return this.total;
    }
}

class InMemoryHistogram implements HistogramMetric {
    private readonly values: number[] = [];

    constructor(public readonly name: string, public readonly description: string) {}

    record(value: number): void {
        this.values.push(value);
    }

    snapshot(): { count: number; min: number; max: number; sum: number; average: number } {
        if (this.values.length === 0) {
            return { count: 0, min: 0, max: 0, sum: 0, average: 0 };
        }

        const sum = this.values.reduce((acc, value) => acc + value, 0);
        return {
            count: this.values.length,
            min: Math.min(...this.values),
            max: Math.max(...this.values),
            sum,
            average: sum / this.values.length,
        };
    }
}

export function createCounter(name: string, description: string): CounterMetric {
    return new InMemoryCounter(name, description);
}

export function createHistogram(name: string, description: string): HistogramMetric {
    return new InMemoryHistogram(name, description);
}
