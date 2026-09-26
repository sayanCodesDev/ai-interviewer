/** Deterministic pseudo-random data, so generated hidden tests are identical on every machine and run. */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randInt(next: () => number, lo: number, hi: number): number {
    return lo + Math.floor(next() * (hi - lo + 1));
}

export function randInts(seed: number, n: number, lo: number, hi: number): number[] {
    const next = rng(seed);
    return Array.from({ length: n }, () => randInt(next, lo, hi));
}

/** n distinct integers in [lo, hi], in random order. */
export function distinctInts(seed: number, n: number, lo: number, hi: number): number[] {
    const next = rng(seed);
    const seen = new Set<number>();
    while (seen.size < n) seen.add(randInt(next, lo, hi));
    return [...seen];
}

export function randString(seed: number, n: number, alphabet: string): string {
    const next = rng(seed);
    let out = "";
    for (let i = 0; i < n; i++) out += alphabet[Math.floor(next() * alphabet.length)];
    return out;
}

export function repeat(text: string, times: number): string {
    return text.repeat(times);
}

export function range(n: number, start = 0): number[] {
    return Array.from({ length: n }, (_, i) => start + i);
}

/**
 * An array with exactly one pair summing to the target, so any correct answer is the only answer.
 * Every other value is rejected if its complement is already present, which makes uniqueness a
 * property of the construction rather than something to hope for.
 */
export function uniqueTwoSum(seed: number, n: number, pairAt: [number, number]): [number[], number] {
    const next = rng(seed);
    const target = 150_000_000;
    const a = randInt(next, 1_000, target / 2 - 1_000);
    const b = target - a;
    const used = new Set<number>([a, b]);
    const others: number[] = [];
    while (others.length < n - 2) {
        const x = randInt(next, -200_000_000, 400_000_000);
        if (used.has(x) || used.has(target - x)) continue;
        used.add(x);
        others.push(x);
    }

    const [i, j] = pairAt;
    const nums: number[] = [];
    let taken = 0;
    for (let k = 0; k < n; k++) {
        if (k === i) nums.push(a);
        else if (k === j) nums.push(b);
        else nums.push(others[taken++]!);
    }
    return [nums, target];
}
