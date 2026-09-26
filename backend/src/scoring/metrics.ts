/** Facts about the interview that need no judgement: counted, not opined. */

export interface TurnRow {
    seq: number;
    role: "INTERVIEWER" | "CANDIDATE" | "SYSTEM";
    roundKey: string | null;
    text: string;
    offsetMs: number;
    interrupted: boolean;
}

export interface SubmissionRow {
    problemKey: string;
    kind: "RUN" | "SUBMIT";
    attempt: number;
    language: string;
    code: string;
    passed: number;
    total: number;
    status: string;
    createdAt: Date;
}

export interface ProblemFacts {
    problemKey: string;
    runs: number;
    attempts: number;
    bestPassed: number;
    total: number;
    finalStatus: string;
    finalLanguage: string;
    finalCode: string;
    hintsUsed: number;
    movedOn: boolean;
    /** 0 to 10, from the tests, with small penalties for extra attempts and hints. */
    correctness: number;
}

export interface InterviewMetrics {
    durationMinutes: number;
    candidateTurns: number;
    candidateWords: number;
    averageWordsPerTurn: number;
    /** um / uh / "you know" and the like, per hundred words. */
    fillersPer100Words: number;
    hintsUsed: number;
    problemsAttempted: number;
    problemsSolved: number;
    /** Mean best test-pass rate over attempted problems, 0 to 1. */
    testPassRate: number;
    problems: ProblemFacts[];
}

const FILLERS = /\b(?:um+|uh+|er+|erm|you know|i mean|sort of|kind of)\b/gi;

const PENALTY_PER_EXTRA_ATTEMPT = 0.6;
const PENALTY_PER_HINT = 0.3;

export function computeMetrics(input: { turns: TurnRow[]; submissions: SubmissionRow[]; startedAt: Date | null; endedAt: Date | null }): InterviewMetrics {
    const candidate = input.turns.filter((t) => t.role === "CANDIDATE");
    const words = candidate.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
    const fillers = candidate.reduce((n, t) => n + (t.text.match(FILLERS)?.length ?? 0), 0);

    const problems = new Map<string, ProblemFacts>();
    const touch = (key: string): ProblemFacts => {
        let facts = problems.get(key);
        if (!facts) {
            facts = { problemKey: key, runs: 0, attempts: 0, bestPassed: 0, total: 0, finalStatus: "NOT_SUBMITTED", finalLanguage: "", finalCode: "", hintsUsed: 0, movedOn: false, correctness: 0 };
            problems.set(key, facts);
        }
        return facts;
    };

    for (const s of [...input.submissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        const facts = touch(s.problemKey);
        if (s.kind === "RUN") {
            facts.runs++;
            continue;
        }
        facts.attempts++;
        facts.total = Math.max(facts.total, s.total);
        facts.bestPassed = Math.max(facts.bestPassed, s.passed);
        facts.finalStatus = s.status;
        facts.finalLanguage = s.language;
        facts.finalCode = s.code;
    }

    // Hints and "moved on" are logged as system lines naming the problem by title, so map them back by title.
    for (const turn of input.turns.filter((t) => t.role === "SYSTEM")) {
        const hint = turn.text.match(/^Hint \d of \d given for "(.+)"$/);
        const moved = turn.text.match(/^Candidate chose to move on from "(.+)"/);
        const title = hint?.[1] ?? moved?.[1];
        if (!title) continue;
        for (const facts of problems.values()) {
            if (titleOf(facts.problemKey) === title || facts.problemKey === title) {
                if (hint) facts.hintsUsed++;
                if (moved) facts.movedOn = true;
            }
        }
        if (moved && ![...problems.values()].some((f) => titleOf(f.problemKey) === title)) {
            const key = keyForTitle(title);
            if (key) { const f = touch(key); f.movedOn = true; }
        }
        if (hint && ![...problems.values()].some((f) => titleOf(f.problemKey) === title)) {
            const key = keyForTitle(title);
            if (key) touch(key).hintsUsed++;
        }
    }

    for (const facts of problems.values()) {
        if (facts.attempts === 0) {
            facts.correctness = 0;
            continue;
        }
        const rate = facts.total > 0 ? facts.bestPassed / facts.total : 0;
        const raw = rate * 10 - Math.max(0, facts.attempts - 1) * PENALTY_PER_EXTRA_ATTEMPT - facts.hintsUsed * PENALTY_PER_HINT;
        facts.correctness = Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
    }

    const attempted = [...problems.values()].filter((p) => p.attempts > 0 || p.movedOn);
    const solved = attempted.filter((p) => p.total > 0 && p.bestPassed === p.total);
    const passRate = attempted.length === 0 ? 0 : attempted.reduce((n, p) => n + (p.total > 0 ? p.bestPassed / p.total : 0), 0) / attempted.length;

    const duration = input.startedAt && input.endedAt ? (input.endedAt.getTime() - input.startedAt.getTime()) / 60_000 : 0;
    return {
        durationMinutes: Math.round(duration * 10) / 10,
        candidateTurns: candidate.length,
        candidateWords: words,
        averageWordsPerTurn: candidate.length === 0 ? 0 : Math.round(words / candidate.length),
        fillersPer100Words: words === 0 ? 0 : Math.round((fillers / words) * 1000) / 10,
        hintsUsed: attempted.reduce((n, p) => n + p.hintsUsed, 0),
        problemsAttempted: attempted.length,
        problemsSolved: solved.length,
        testPassRate: Math.round(passRate * 100) / 100,
        problems: attempted,
    };
}

// The bank is imported lazily to keep this module free of heavy dependencies at load time.
import { ALL_PROBLEMS } from "../interview/problems";

function titleOf(key: string): string | undefined {
    return ALL_PROBLEMS.find((p) => p.key === key)?.title;
}

function keyForTitle(title: string): string | undefined {
    return ALL_PROBLEMS.find((p) => p.title === title)?.key;
}
