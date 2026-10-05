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
    snapshot(): {
        count: number;
        min: number;
        max: number;
        sum: number;
        average: number;
    };
}
export declare function createCounter(name: string, description: string): CounterMetric;
export declare function createHistogram(name: string, description: string): HistogramMetric;
//# sourceMappingURL=metrics.d.ts.map