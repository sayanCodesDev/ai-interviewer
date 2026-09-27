// Mirrors the shapes the backend sends. Kept by hand next to the API helpers; a change to a backend
// response type should be reflected here.

export type Level = "intern" | "junior" | "mid" | "senior" | "staff";
export type Format = "quick" | "standard" | "full" | "drill";
export type Language = "javascript" | "typescript" | "python" | "cpp" | "java";
export type RoundType = "intro" | "background" | "coding" | "technical" | "system_design" | "behavioral" | "wrapup";

export const LANGUAGES: Array<{ value: Language; label: string; monaco: string }> = [
    { value: "javascript", label: "JavaScript", monaco: "javascript" },
    { value: "typescript", label: "TypeScript", monaco: "typescript" },
    { value: "python", label: "Python", monaco: "python" },
    { value: "cpp", label: "C++", monaco: "cpp" },
    { value: "java", label: "Java", monaco: "java" },
];

export interface InterviewOptions {
    roles: string[];
    levels: Level[];
    formats: Array<{ id: Format; label: string; minutes: number; description: string }>;
    voices: Array<{ id: string; name: string; description: string }>;
    accents: Array<{ id: string; label: string }>;
}

export interface PublicProblem {
    key: string;
    title: string;
    difficulty: "easy" | "medium" | "hard";
    statement: string;
    constraints: string[];
    signature: { name: string; params: Array<{ name: string; type: string }>; returns: string };
    examples: Array<{ input: unknown[]; output: unknown; explanation?: string }>;
    starter: Record<Language, string>;
}

export type CaseStatus = "pass" | "fail" | "error" | "timeout" | "skipped" | "ran";
export type RunStatus = "PASSED" | "FAILED" | "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT" | "ERROR";

export interface CaseResult {
    id: string;
    label?: string;
    hidden: boolean;
    status: CaseStatus;
    actual?: unknown;
    expected?: unknown;
    error?: string;
    stdout?: string;
    ms?: number;
}

export interface TestRun {
    status: RunStatus;
    passed: number;
    total: number;
    cases: CaseResult[];
    compileOutput?: string;
    stderr?: string;
    message?: string;
    runtimeMs: number;
}

export type ServerEvent =
    | { type: "ROUND"; index: number; total: number; key: string; title: string; roundType: RoundType; minutes: number }
    | { type: "SHOW_CODE_EDITOR"; mode: "code" | "notes"; problemNumber: number; problemTotal: number; problem?: PublicProblem; title: string; question: string; language: string }
    | { type: "HIDE_CODE_EDITOR" }
    | { type: "SUBMISSION_RESULT"; problemKey: string; attempt: number; run: TestRun }
    | { type: "CAPTION"; id: string; role: "interviewer" | "candidate"; text: string; final: boolean }
    | { type: "STATE"; state: "thinking" | "listening" | "speaking" | "ending" }
    | { type: "ENDING"; reason: string; interviewId: string }
    | { type: "NOTICE"; level: "info" | "warning"; message: string };

export interface PlanSummary {
    totalMinutes: number;
    format: Format;
    level: Level;
    role: string;
    rounds: Array<{ key: string; type: RoundType; title: string; minutes: number; problems?: number }>;
}

export interface InterviewMeta {
    id: string;
    status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
    role: string;
    level: Level;
    format: Format;
    durationMinutes: number;
    voice: string;
    planStatus: "PENDING" | "READY" | "FAILED";
    planError: string | null;
    plan: PlanSummary | null;
    analysisSource: "llm" | "fallback" | null;
    reportStatus: "NONE" | "PENDING" | "GENERATING" | "READY" | "FAILED";
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
}

export interface InterviewListItem {
    id: string;
    role: string;
    level: Level;
    format: Format;
    status: InterviewMeta["status"];
    createdAt: string;
    durationSeconds: number | null;
    reportStatus: InterviewMeta["reportStatus"];
    score: number | null;
    band: string | null;
}

export interface Evidence { turn: number; quote: string }

export interface DimensionReport { key: string; label: string; score: number | null; weight: number; summary: string; evidence: Evidence[]; objective: boolean }
export interface RoundReport { key: string; title: string; type: string; score: number | null; summary: string; highlights: string[] }
/** One note in the line-by-line review of a submitted solution. */
export interface CodeNote {
    line: number;
    endLine: number;
    severity: "praise" | "suggestion" | "issue";
    comment: string;
}

export interface ProblemReport {
    problemKey: string; title: string; difficulty: string; attempts: number; runs: number; passed: number; total: number; status: string;
    hintsUsed: number; movedOn: boolean; language: string; code: string;
    intendedComplexity: { time: string; space: string };
    complexity: { stated: string | null; verdict: "correct" | "partially" | "incorrect" | "not_discussed" };
    codeQuality: string; feedback: string;
    /** Absent in reports made before the line-by-line review existed. */
    review?: CodeNote[];
}

export interface ReportData {
    version: 1;
    overall: { score: number; band: "Interview-ready" | "Close" | "Developing" | "Early stage"; headline: string };
    summary: string;
    dimensions: DimensionReport[];
    rounds: RoundReport[];
    problems: ProblemReport[];
    strengths: Array<{ title: string; detail: string; evidence: Evidence[] }>;
    improvements: Array<{ title: string; detail: string; priority: 1 | 2 | 3; evidence: Evidence[] }>;
    studyPlan: Array<{ topic: string; why: string; actions: string[]; priority: "high" | "medium" | "low"; resources: Array<{ title: string; url: string }>; evidence?: Evidence[] }>;
    metrics: {
        durationMinutes: number; candidateTurns: number; candidateWords: number; averageWordsPerTurn: number; fillersPer100Words: number;
        hintsUsed: number; problemsAttempted: number; problemsSolved: number; testPassRate: number; segmentsAnalysed: number; segmentsTotal: number;
    };
    disclaimer: string;
    generatedBy: { model: string; promptVersion: string };
}

export interface TranscriptEntry {
    seq: number;
    role: "interviewer" | "candidate" | "system";
    roundKey: string | null;
    text: string;
    offsetMs: number;
    interrupted: boolean;
}

export interface ReportResponse {
    interview: { id: string; role: string; level: Level; format: Format; status: InterviewMeta["status"]; startedAt: string | null; endedAt: string | null; endReason: string | null; rounds: Array<{ key: string; title: string; type: RoundType }> };
    status: InterviewMeta["reportStatus"];
    error: string | null;
    report: ReportData | null;
    createdAt: string | null;
    transcript: TranscriptEntry[];
    submissions: Array<{ problemKey: string; attempt: number; language: string; code: string; passed: number; total: number; status: string; at: string }>;
}
