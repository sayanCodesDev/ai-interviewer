// Client-side facts about the current interview, kept in sessionStorage so the room and the
// result screen can show them. Nothing here is sent to the backend.
const KEYS = {
    role: "interview:role",
    startedAt: "interview:startedAt",
    endedAt: "interview:endedAt",
    problems: "interview:problems",
} as const;

function read(key: string): string | null {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // Storage can be unavailable; the summary is a nicety, so ignore.
    }
}

/** Begin a fresh record when the candidate submits the setup form. */
export function resetInterviewSession(role: string) {
    try {
        sessionStorage.removeItem(KEYS.startedAt);
        sessionStorage.removeItem(KEYS.endedAt);
        sessionStorage.removeItem(KEYS.problems);
    } catch {
        // ignore
    }
    write(KEYS.role, role);
}

export function getInterviewRole() {
    return read(KEYS.role) ?? undefined;
}

/** Records the connection time once and returns it, so a retry doesn't restart the clock. */
export function markInterviewStarted(): number {
    const existing = Number(read(KEYS.startedAt));
    if (existing) return existing;
    const now = Date.now();
    write(KEYS.startedAt, String(now));
    return now;
}

export function markInterviewEnded() {
    write(KEYS.endedAt, String(Date.now()));
}

export function recordProblemSubmitted(problemNumber: number) {
    const submitted = new Set<number>(readProblems());
    submitted.add(problemNumber);
    write(KEYS.problems, JSON.stringify([...submitted]));
}

function readProblems(): number[] {
    try {
        const parsed = JSON.parse(read(KEYS.problems) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "number") : [];
    } catch {
        return [];
    }
}

export interface InterviewSummary {
    role?: string;
    durationSeconds?: number;
    problemsSubmitted?: number;
}

export function readInterviewSummary(): InterviewSummary | null {
    const startedAt = Number(read(KEYS.startedAt));
    const endedAt = Number(read(KEYS.endedAt));
    const role = getInterviewRole();
    const problemsSubmitted = readProblems().length;

    const summary: InterviewSummary = {
        role,
        durationSeconds: startedAt && endedAt && endedAt > startedAt ? Math.round((endedAt - startedAt) / 1000) : undefined,
        problemsSubmitted: startedAt ? problemsSubmitted : undefined,
    };

    return summary.role || summary.durationSeconds !== undefined || summary.problemsSubmitted !== undefined ? summary : null;
}
