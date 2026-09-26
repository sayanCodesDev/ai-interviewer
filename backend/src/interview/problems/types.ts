/** Parameter and return types a problem may use. Every language's harness supports exactly these. */
export const PARAM_TYPES = [
    "int", "long", "double", "bool", "string",
    "int[]", "double[]", "bool[]", "string[]",
    "int[][]", "string[][]",
] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export type Difficulty = "easy" | "medium" | "hard";

/**
 * How a candidate's return value is judged against the expected one.
 * - exact: deep equality
 * - unordered: arrays compare as multisets (any order of elements)
 * - unorderedDeep: arrays of arrays compare as multisets of multisets (e.g. groups, triplets)
 * - float: numbers within a small tolerance
 */
export type CompareMode = "exact" | "unordered" | "unorderedDeep" | "float";

export interface Param {
    name: string;
    type: ParamType;
}

export interface Signature {
    /** camelCase; Python uses the snake_case form. */
    name: string;
    params: Param[];
    returns: ParamType;
}

export interface Example {
    input: unknown[];
    output: unknown;
    explanation?: string;
}

/** Hidden tests carry a label instead of their data, so feedback can name the case without leaking it. */
export interface HiddenCase {
    label: string;
    input: unknown[];
}

export interface ProblemDef {
    key: string;
    title: string;
    difficulty: Difficulty;
    /** Topic tags, used to match problems to a job description. */
    tags: string[];
    /** Plain text, written to be read aloud as well as read. */
    statement: string;
    constraints: string[];
    signature: Signature;
    examples: Example[];
    hidden: HiddenCase[];
    compare?: CompareMode;
    /** Progressive hints, from a nudge to nearly the answer. */
    hints: [string, string, string];
    /** What a strong solution looks like; used by the interviewer and the report, never shown to the candidate. */
    solution: { approach: string; time: string; space: string };
    /** Reference solution (Python) used to generate and verify the expected outputs. */
    reference: string;
}

/** A problem together with its verified expected outputs. */
export interface Problem extends ProblemDef {
    expectedHidden: unknown[];
}

/** What the candidate is allowed to see of a problem. */
export interface PublicProblem {
    key: string;
    title: string;
    difficulty: Difficulty;
    statement: string;
    constraints: string[];
    signature: Signature;
    examples: Example[];
    starter: Record<string, string>;
}

export function isArrayType(type: ParamType): boolean {
    return type.endsWith("[]");
}

export function arrayDepth(type: ParamType): number {
    return (type.match(/\[\]/g) ?? []).length;
}

export function baseType(type: ParamType): "int" | "long" | "double" | "bool" | "string" {
    return type.replace(/\[\]/g, "") as "int" | "long" | "double" | "bool" | "string";
}

/** Checks that a JSON value has exactly the shape a type promises. Guards the harness against bad input. */
export function conformsTo(type: ParamType, value: unknown): boolean {
    const depth = arrayDepth(type);
    const base = baseType(type);

    const scalar = (v: unknown): boolean => {
        switch (base) {
            case "int": return Number.isInteger(v) && Math.abs(v as number) <= 2_147_483_647;
            case "long": return Number.isInteger(v);
            case "double": return typeof v === "number" && Number.isFinite(v);
            case "bool": return typeof v === "boolean";
            case "string": return typeof v === "string";
        }
    };
    const check = (v: unknown, remaining: number): boolean =>
        remaining === 0 ? scalar(v) : Array.isArray(v) && v.every((item) => check(item, remaining - 1));

    return check(value, depth);
}
