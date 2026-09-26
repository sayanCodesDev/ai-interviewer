import crypto from "node:crypto";
import { runJob, type Language, type RunOutput } from "../../runner";
import { outputsMatch } from "./compare";
import { buildRunJob, CPP_PRELUDE_LINES } from "./harness";
import { conformsTo, type CompareMode, type Signature } from "./types";

export interface CaseInput {
    id: string;
    args: unknown[];
    /** Absent for a "run with my own input" case, which has nothing to compare against. */
    expected?: unknown;
    label?: string;
    hidden?: boolean;
}

export type CaseStatus = "pass" | "fail" | "error" | "timeout" | "skipped" | "ran";

export interface CaseResult {
    id: string;
    label?: string;
    hidden: boolean;
    status: CaseStatus;
    actual?: unknown;
    expected?: unknown;
    error?: string;
    /** What the candidate's own code printed during this case. */
    stdout?: string;
    ms?: number;
}

export type RunStatus = "PASSED" | "FAILED" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT" | "ERROR";

export interface TestRun {
    status: RunStatus;
    passed: number;
    total: number;
    cases: CaseResult[];
    compileOutput?: string;
    /** Errors that happened outside any single case: syntax errors, crashes. */
    stderr?: string;
    /** A message for problems that are ours (harness refused the code, runner down). */
    message?: string;
    /** Time spent inside the candidate's function across all cases. */
    runtimeMs: number;
}

interface Outcome {
    kind: "R" | "E";
    micros?: number;
    actual?: unknown;
    message?: string;
    userOutput: string;
}

const MAX_CAPTURED_OUTPUT = 4_000;

/** Reads the marker lines the harness printed. Anything else on stdout belongs to the candidate. */
export function parseHarnessOutput(stdout: string, token: string): { outcomes: Map<string, Outcome>; began: string[] } {
    const marker = new RegExp(`^@@${token}\\|([BRE])\\|(.*)$`);
    const outcomes = new Map<string, Outcome>();
    const began: string[] = [];
    let current: { id: string; buffer: string[] } | null = null;

    const captured = (buffer: string[]) => {
        // The harness always writes a newline before a marker, so one trailing empty line is its own.
        const copy = [...buffer];
        if (copy.length > 0 && copy[copy.length - 1] === "") copy.pop();
        return copy.join("\n").slice(0, MAX_CAPTURED_OUTPUT);
    };

    for (const line of stdout.split("\n")) {
        const found = marker.exec(line);
        if (!found) {
            current?.buffer.push(line);
            continue;
        }
        const kind = found[1] as "B" | "R" | "E";
        const rest = found[2] ?? "";

        if (kind === "B") {
            current = { id: rest, buffer: [] };
            began.push(rest);
        } else if (kind === "R") {
            const first = rest.indexOf("|");
            const second = rest.indexOf("|", first + 1);
            const id = rest.slice(0, first);
            let actual: unknown;
            let message: string | undefined;
            try {
                actual = JSON.parse(rest.slice(second + 1));
            } catch {
                message = "The returned value could not be read back.";
            }
            outcomes.set(id, message
                ? { kind: "E", message, userOutput: captured(current?.buffer ?? []) }
                : { kind: "R", micros: Number(rest.slice(first + 1, second)) || 0, actual, userOutput: captured(current?.buffer ?? []) });
            current = null;
        } else {
            const first = rest.indexOf("|");
            outcomes.set(rest.slice(0, first), { kind: "E", message: rest.slice(first + 1), userOutput: captured(current?.buffer ?? []) });
            current = null;
        }
    }
    return { outcomes, began };
}

/** Removes sandbox paths and renames internal files, so messages talk about the candidate's own code. */
export function cleanToolOutput(text: string, language: Language): string {
    let out = text.replace(/(?:\/[\w.-]+)*\/job-[\w-]+\//g, "");
    out = out
        .replace(/main\.mjs/g, "solution.js")
        .replace(/main\.ts/g, "solution.ts")
        .replace(/main\.py/g, "solution.py")
        .replace(/main\.cpp/g, "solution.cpp");
    if (language === "cpp") {
        // The harness adds a two-line prelude; report line numbers as the candidate sees them.
        out = out.replace(/solution\.cpp:(\d+)/g, (_, line) => `solution.cpp:${Math.max(1, Number(line) - CPP_PRELUDE_LINES)}`);
    }
    return out.trim().slice(0, 3_000);
}

function timeoutFor(caseCount: number): number {
    return Math.min(12_000, Math.max(4_000, 3_000 + caseCount * 400));
}

export function validateArgs(signature: Signature, args: unknown[]): string | null {
    if (args.length !== signature.params.length) {
        return `Expected ${signature.params.length} argument${signature.params.length === 1 ? "" : "s"}, got ${args.length}.`;
    }
    for (const [i, param] of signature.params.entries()) {
        if (!conformsTo(param.type, args[i])) return `Argument ${i + 1} (${param.name}) should be a ${param.type}.`;
    }
    return null;
}

interface RunTestsInput {
    signature: Signature;
    compare?: CompareMode;
    language: Language;
    code: string;
    cases: CaseInput[];
}

export function blankRun(status: RunStatus, cases: CaseInput[], extra: Partial<TestRun> = {}): TestRun {
    return {
        status,
        passed: 0,
        total: cases.filter((c) => c.expected !== undefined).length,
        cases: cases.map((c) => ({ id: c.id, label: c.label, hidden: !!c.hidden, status: "skipped" as const })),
        runtimeMs: 0,
        ...extra,
    };
}

/** Runs the candidate's code against a list of cases inside the sandbox and grades each one. */
export async function runTests(input: RunTestsInput): Promise<TestRun> {
    const { signature, compare, language, code, cases } = input;
    const token = crypto.randomBytes(12).toString("hex");

    const built = buildRunJob(
        signature, language, code,
        cases.map((c) => ({ id: c.id, args: c.args })),
        token,
        { runTimeoutMs: timeoutFor(cases.length) },
    );
    if (!built.ok) return blankRun("COMPILE_ERROR", cases, { compileOutput: built.message });

    let output: RunOutput;
    try {
        output = await runJob(built.job);
    } catch (error) {
        return blankRun("ERROR", cases, { message: (error as Error).message });
    }

    if (output.error) return blankRun("ERROR", cases, { message: output.error });
    if (output.compile && !output.compile.ok) {
        return blankRun("COMPILE_ERROR", cases, { compileOutput: cleanToolOutput(output.compile.output || "Compilation failed.", language) });
    }
    if (!output.run) return blankRun("ERROR", cases, { message: "The sandbox produced no result." });

    const run = output.run;
    const { outcomes, began } = parseHarnessOutput(run.stdout, token);
    const lastBegun = began[began.length - 1];

    let passed = 0;
    let microsTotal = 0;
    let sawTimeout = false;
    let sawError = false;
    let sawFail = false;

    const results: CaseResult[] = cases.map((c) => {
        const base = { id: c.id, label: c.label, hidden: !!c.hidden };
        const outcome = outcomes.get(c.id);

        if (outcome?.kind === "R") {
            microsTotal += outcome.micros ?? 0;
            const ms = Math.round((outcome.micros ?? 0) / 100) / 10;
            if (c.expected === undefined) return { ...base, status: "ran" as const, actual: outcome.actual, stdout: outcome.userOutput, ms };
            const ok = outputsMatch(compare, c.expected, outcome.actual);
            if (ok) passed++;
            else sawFail = true;
            return { ...base, status: ok ? ("pass" as const) : ("fail" as const), actual: outcome.actual, expected: c.expected, stdout: outcome.userOutput, ms };
        }
        if (outcome?.kind === "E") {
            sawError = true;
            return { ...base, status: "error" as const, error: cleanToolOutput(outcome.message ?? "Error", language), stdout: outcome.userOutput };
        }
        if (c.id === lastBegun) {
            if (run.timedOut) {
                sawTimeout = true;
                return { ...base, status: "timeout" as const };
            }
            sawError = true;
            const why = run.signal === "SIGKILL" ? "The program was killed. It probably ran out of memory." : "The program crashed.";
            return { ...base, status: "error" as const, error: why };
        }
        return { ...base, status: "skipped" as const };
    });

    const total = cases.filter((c) => c.expected !== undefined).length;
    const stderr = cleanToolOutput(run.stderr, language) || undefined;
    const nothingRan = outcomes.size === 0 && began.length === 0;

    let status: RunStatus;
    if (nothingRan && run.timedOut) status = "TIMEOUT";
    else if (nothingRan && (run.exitCode !== 0 || stderr)) status = "RUNTIME_ERROR";
    else if (total > 0 && passed === total) status = "PASSED";
    else if (total === 0 && !sawError && !sawTimeout) status = "PASSED";
    else if (sawTimeout) status = "TIMEOUT";
    else if (sawError && !sawFail) status = "RUNTIME_ERROR";
    else status = "FAILED";

    return { status, passed, total, cases: results, stderr, runtimeMs: Math.round(microsTotal / 1000), ...(run.truncated ? { message: "Output was cut off because it was too long." } : {}) };
}
