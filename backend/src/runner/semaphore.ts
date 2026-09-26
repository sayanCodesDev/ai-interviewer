/** Caps how many things run at once; the rest wait in order. */
export class Semaphore {
    private available: number;
    private readonly waiters: Array<() => void> = [];

    constructor(permits: number) {
        this.available = permits;
    }

    get waiting(): number {
        return this.waiters.length;
    }

    async use<T>(task: () => Promise<T>, maxWaitMs = 30_000): Promise<T> {
        await this.acquire(maxWaitMs);
        try {
            return await task();
        } finally {
            this.release();
        }
    }

    private acquire(maxWaitMs: number): Promise<void> {
        if (this.available > 0) {
            this.available--;
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = this.waiters.indexOf(grant);
                if (index >= 0) this.waiters.splice(index, 1);
                reject(new Error("The code runner is busy. Try again in a moment."));
            }, maxWaitMs);
            const grant = () => {
                clearTimeout(timer);
                resolve();
            };
            this.waiters.push(grant);
        });
    }

    private release(): void {
        const next = this.waiters.shift();
        if (next) next();
        else this.available++;
    }
}
