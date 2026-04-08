export class DataBus {
    private data: Map<string, unknown> = new Map();

    set(key: string, value: unknown): void {
        this.data.set(key, value);
    }

    get(key: string): unknown {
        return this.data.get(key);
    }

    getAll(): Record<string, unknown> {
        return Object.fromEntries(this.data.entries());
    }

    getPath(path: string): unknown {
        const parts = path.split('.');
        let current: unknown = this.getAll();

        for (const part of parts) {
            if (current === undefined || current === null || typeof current !== "object") {
                return undefined;
            }

            current = (current as Record<string, unknown>)[part];
        }

        return current;
    }

    toTemplateContext(): Record<string, unknown> {
        return this.getAll();
    }
}
