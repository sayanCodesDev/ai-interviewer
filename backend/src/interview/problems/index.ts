import type { Language } from "../../runner/types";
import { LANGUAGES } from "../../runner/types";
import { easyProblems } from "./data/easy";
import { hardProblems } from "./data/hard";
import { mediumProblems } from "./data/medium";
import { starterCode } from "./harness";
import { logger } from "../../observability/logger";
import { blankRun, runTests, validateArgs, type CaseInput, type TestRun } from "./runTests";
import { conformsTo, type Difficulty, type Problem, type ProblemDef, type PublicProblem } from "./types";

export * from "./types";
export { runTests, validateArgs } from "./runTests";
export type { CaseResult, TestRun } from "./runTests";

export const ALL_PROBLEMS: readonly ProblemDef[] = [...easyProblems, ...mediumProblems, ...hardProblems];

const byKey = new Map(ALL_PROBLEMS.map((problem) => [problem.key, problem]));

/** Structural checks that catch a malformed problem the moment the module loads, not mid-interview. */
export function validateProblemDef(def: ProblemDef): string[] {
    const errors: string[] = [];
    const { signature } = def;
    if (!/^[a-z0-9-]+$/.test(def.key)) errors.push("key must be kebab-case");
    if (def.examples.length < 1) errors.push("needs at least one example");
    if (def.hidden.length < 4) errors.push("needs at least four hidden cases");
    if (def.hints.length !== 3) errors.push("needs exactly three hints");
    if (!def.reference.includes(`def ${signature.name.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}(`)) {
        errors.push("reference solution must define the snake_case function");
    }
    for (const [i, example] of def.examples.entries()) {
        const problem = validateArgs(signature, example.input);
        if (problem) errors.push(`example ${i + 1}: ${problem}`);
        if (!conformsTo(signature.returns, example.output)) errors.push(`example ${i + 1}: output is not a ${signature.returns}`);
    }
    for (const [i, hidden] of def.hidden.entries()) {
        const problem = validateArgs(signature, hidden.input);
        if (problem) errors.push(`hidden case ${i + 1} (${hidden.label}): ${problem}`);
    }
    return errors;
}

for (const def of ALL_PROBLEMS) {
    const errors = validateProblemDef(def);
    if (errors.length > 0) throw new Error(`Problem "${def.key}" is invalid:\n  ${errors.join("\n  ")}`);
}
if (byKey.size !== ALL_PROBLEMS.length) throw new Error("Duplicate problem keys in the bank.");

export function getProblemDef(key: string): ProblemDef | undefined {
    return byKey.get(key);
}

/** The candidate's view of a problem: statement, examples and starter code. Never hidden tests or solutions. */
export function publicView(def: ProblemDef): PublicProblem {
    return {
        key: def.key,
        title: def.title,
        difficulty: def.difficulty,
        statement: def.statement,
        constraints: def.constraints,
        signature: def.signature,
        examples: def.examples,
        starter: Object.fromEntries(LANGUAGES.map((language) => [language, starterCode(def.signature, language)])),
    };
}

// ------------------------------------------------------------------------------------ expected values

const expectedCache = new Map<string, Promise<unknown[]>>();

/**
 * The reference solution is the source of truth for hidden-test answers. It runs in the same
 * sandbox as candidate code, once per problem per process, and the answers are cached. Nothing
 * large is stored in the repository, and the answers can never drift from the reference.
 */
export function expectedOutputs(def: ProblemDef): Promise<unknown[]> {
    let pending = expectedCache.get(def.key);
    if (!pending) {
        pending = computeExpected(def).catch((error) => {
            expectedCache.delete(def.key); // don't cache a failure; the next attempt retries
            throw error;
        });
        expectedCache.set(def.key, pending);
    }
    return pending;
}

async function computeExpected(def: ProblemDef): Promise<unknown[]> {
    const run = await runTests({
        signature: def.signature,
        language: "python",
        code: def.reference,
        cases: def.hidden.map((hidden, i) => ({ id: `h${i}`, args: hidden.input, label: hidden.label })),
    });
    if (run.status !== "PASSED" || run.cases.some((c) => c.status !== "ran")) {
        const detail = run.cases.find((c) => c.status !== "ran");
        throw new Error(`Reference solution for "${def.key}" failed: ${run.status} ${run.stderr ?? detail?.error ?? run.message ?? ""}`.trim());
    }
    return run.cases.map((c) => c.actual);
}

/** Start computing expected outputs in the background so the first submission doesn't wait for them. */
export function warmExpected(keys: string[]): void {
    for (const key of keys) {
        const def = byKey.get(key);
        if (def) void expectedOutputs(def).catch(() => { /* surfaced when a submission needs it */ });
    }
}

export async function toProblem(def: ProblemDef): Promise<Problem> {
    return { ...def, expectedHidden: await expectedOutputs(def) };
}

// ------------------------------------------------------------------------------------------ running

/** "Run": the visible examples only. Fast feedback, and the candidate sees inputs and expected values. */
export function runExamples(def: ProblemDef, language: Language, code: string): Promise<TestRun> {
    const cases: CaseInput[] = def.examples.map((example, i) => ({
        id: `e${i}`,
        args: example.input,
        expected: example.output,
        label: `Example ${i + 1}`,
    }));
    return runTests({ signature: def.signature, compare: def.compare, language, code, cases });
}

/** "Submit": the visible examples plus every hidden case. Hidden cases are graded but never revealed. */
export async function runAll(def: ProblemDef, language: Language, code: string): Promise<TestRun> {
    let expected: unknown[];
    try {
        expected = await expectedOutputs(def);
    } catch (error) {
        // The hidden answers come from running the reference solution in the sandbox. If that can't run, the
        // candidate is told to retry; it is never a reason to throw (the call would sit on "thinking" forever).
        logger.error({ err: error, problem: def.key }, "Could not compute the expected outputs");
        return blankRun("ERROR", def.examples.map((_, i) => ({ id: `e${i}`, args: [] })), {
            message: "We couldn't grade that just now because the code sandbox is unavailable. Your code is still in the editor, so try submitting again in a moment.",
        });
    }
    const cases: CaseInput[] = [
        ...def.examples.map((example, i) => ({ id: `e${i}`, args: example.input, expected: example.output, label: `Example ${i + 1}` })),
        ...def.hidden.map((hidden, i) => ({ id: `h${i}`, args: hidden.input, expected: expected[i], label: hidden.label, hidden: true })),
    ];
    return runTests({ signature: def.signature, compare: def.compare, language, code, cases });
}

/** "Run with my own input": nothing to compare against, just what the code returns. */
export function runCustom(def: ProblemDef, language: Language, code: string, args: unknown[]): Promise<TestRun> {
    return runTests({ signature: def.signature, compare: def.compare, language, code, cases: [{ id: "custom", args, label: "Custom input" }] });
}

/** Removes everything a candidate must not learn from a graded run: hidden inputs, expected values and outputs. */
export function redactHidden(run: TestRun): TestRun {
    return {
        ...run,
        cases: run.cases.map((c) => (c.hidden ? { id: c.id, label: c.label, hidden: true, status: c.status, ms: c.ms } : c)),
    };
}

// --------------------------------------------------------------------------------------- selection

export type Level = "intern" | "junior" | "mid" | "senior" | "staff";

const LADDERS: Record<Level, Difficulty[]> = {
    intern: ["easy", "easy", "medium", "medium", "medium"],
    junior: ["easy", "medium", "medium", "medium", "hard"],
    mid: ["medium", "medium", "medium", "hard", "medium"],
    senior: ["medium", "medium", "hard", "medium", "hard"],
    staff: ["medium", "hard", "hard", "medium", "hard"],
};

const SINGLE_PROBLEM_DIFFICULTY: Record<Level, Difficulty> = { intern: "easy", junior: "medium", mid: "medium", senior: "medium", staff: "hard" };

function seededShuffle<T>(seed: string, items: T[]): T[] {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const next = () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

export interface SelectionCriteria {
    count: number;
    level: Level;
    /** Topics from the job description, e.g. "graph", "dynamic-programming". Matching problems are preferred. */
    preferredTags?: string[];
    /** How strongly the candidate's role and work call for each topic. Supersedes preferredTags where present. */
    tagWeights?: Record<string, number>;
    exclude?: string[];
    /** Makes the choice reproducible per interview. */
    seed: string;
}

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const rank = (difficulty: Difficulty) => DIFFICULTIES.indexOf(difficulty);

/** The hardest problem a level is ever given, however well it is going. */
const CEILING: Record<Level, Difficulty> = { intern: "medium", junior: "hard", mid: "hard", senior: "hard", staff: "hard" };
/** The easiest: senior candidates are not given warm-up problems because the last one went badly. */
const FLOOR: Record<Level, Difficulty> = { intern: "easy", junior: "easy", mid: "easy", senior: "medium", staff: "medium" };

interface Fit {
    difficulty: Difficulty;
    tagWeights: Record<string, number>;
    /** The problem chosen just before, so a topic is not repeated back to back. */
    previous?: ProblemDef;
    chosen: ProblemDef[];
}

/** How well a problem suits a slot: the right difficulty first, then what the candidate's work calls for, then variety. */
function fitScore(problem: ProblemDef, { difficulty, tagWeights, previous, chosen }: Fit): number {
    const gap = Math.abs(rank(problem.difficulty) - rank(difficulty));
    const difficultyFit = gap === 0 ? 10 : gap === 1 ? 3 : -6;
    // Each topic counts up to a cap, so a problem matching many weak topics does not beat one matching the main topic well.
    const relevance = problem.tags.reduce((sum, tag) => sum + Math.min(4, tagWeights[tag] ?? 0), 0) * 1.5;
    const repeatsTopic = previous && problem.tags[0] === previous.tags[0] ? -4 : 0;
    const overlaps = chosen.some((other) => other.tags.filter((tag) => problem.tags.includes(tag)).length >= 2) ? -2 : 0;
    return difficultyFit + relevance + repeatsTopic + overlaps;
}

function weightsOf({ preferredTags = [], tagWeights }: Pick<SelectionCriteria, "preferredTags" | "tagWeights">): Record<string, number> {
    if (tagWeights) return tagWeights;
    return Object.fromEntries(preferredTags.map((tag) => [tag.toLowerCase(), 1.4]));
}

/**
 * Picks problems that ramp up in difficulty, follow the topics the candidate's role and work call for, and don't repeat a
 * topic back to back. Deterministic for a given seed: the seed only breaks ties between problems that suit equally well.
 */
export function selectProblems(criteria: SelectionCriteria): string[] {
    const { count, level, exclude = [], seed } = criteria;
    const ladder = count === 1 ? [SINGLE_PROBLEM_DIFFICULTY[level]] : LADDERS[level].slice(0, count);
    const tagWeights = weightsOf(criteria);
    const chosen: ProblemDef[] = [];
    const used = new Set(exclude);

    for (const [slot, difficulty] of ladder.entries()) {
        const pool = seededShuffle(`${seed}:${slot}`, ALL_PROBLEMS.filter((p) => !used.has(p.key)));
        const fit: Fit = { difficulty, tagWeights, previous: chosen[chosen.length - 1], chosen };
        // reduce keeps the first of equals, and the pool is shuffled by the seed: that is the tie-break.
        const best = pool.reduce<ProblemDef | undefined>((top, p) => (!top || fitScore(p, fit) > fitScore(top, fit) ? p : top), undefined);
        if (!best) break;
        chosen.push(best);
        used.add(best.key);
    }
    return chosen.map((p) => p.key);
}

export type ProblemOutcome = "solved_clean" | "solved_with_help" | "failed" | "moved_on";

/** How the candidate did on a problem, in the three ways that matter for choosing the next one. */
export function judgeOutcome(input: { passed: boolean; attempts: number; hints: number; movedOn: boolean }): ProblemOutcome {
    if (input.passed) return input.attempts <= 1 && input.hints === 0 ? "solved_clean" : "solved_with_help";
    return input.movedOn ? "moved_on" : "failed";
}

/**
 * The next problem, chosen for the person in front of the interviewer: harder after a clean solve, the same after a solve that
 * needed help, easier after one they could not finish. Only the difficulty moves; the topics still follow the job.
 */
export function chooseNextProblem(input: {
    level: Level;
    previous: ProblemDef;
    outcome: ProblemOutcome;
    tagWeights: Record<string, number>;
    exclude: string[];
    seed: string;
}): ProblemDef | undefined {
    const { level, previous, outcome } = input;
    let target = rank(previous.difficulty);
    if (outcome === "solved_clean") target += 1;
    else if (outcome === "failed" || outcome === "moved_on") target -= 1;
    target = Math.min(rank(CEILING[level]), Math.max(rank(FLOOR[level]), target));

    const used = new Set(input.exclude);
    const pool = seededShuffle(input.seed, ALL_PROBLEMS.filter((p) => !used.has(p.key)));
    const fit: Fit = { difficulty: DIFFICULTIES[target]!, tagWeights: input.tagWeights, previous, chosen: [previous] };
    return pool.reduce<ProblemDef | undefined>((top, p) => (!top || fitScore(p, fit) > fitScore(top, fit) ? p : top), undefined);
}

/** Every topic tag in the bank, so the JD analysis can be steered toward tags we can actually serve. */
export const KNOWN_TAGS: readonly string[] = [...new Set(ALL_PROBLEMS.flatMap((p) => p.tags))].sort();
