import type { CompareMode } from "./types";

const FLOAT_TOLERANCE = 1e-6;

function canonical(value: unknown): string {
    return JSON.stringify(value);
}

function sortedDeep(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    return value.map(sortedDeep).sort((a, b) => {
        const left = canonical(a);
        const right = canonical(b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
}

function closeEnough(a: unknown, b: unknown): boolean {
    if (typeof a === "number" && typeof b === "number") {
        const diff = Math.abs(a - b);
        return diff <= FLOAT_TOLERANCE || diff <= FLOAT_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => closeEnough(item, b[i]));
    return canonical(a) === canonical(b);
}

/** Does the candidate's output count as the expected one under the problem's comparison mode? */
export function outputsMatch(mode: CompareMode | undefined, expected: unknown, actual: unknown): boolean {
    switch (mode ?? "exact") {
        case "unordered":
            if (!Array.isArray(expected) || !Array.isArray(actual)) return canonical(expected) === canonical(actual);
            return canonical([...expected].map(canonical).sort()) === canonical([...actual].map(canonical).sort());
        case "unorderedDeep":
            return canonical(sortedDeep(expected)) === canonical(sortedDeep(actual));
        case "float":
            return closeEnough(expected, actual);
        default:
            return canonical(expected) === canonical(actual);
    }
}
