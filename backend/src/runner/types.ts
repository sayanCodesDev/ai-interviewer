export const LANGUAGES = ["javascript", "typescript", "python", "cpp", "java"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
    return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export interface RunJob {
    language: Language;
    /** File name -> content. Names are validated by the runner. */
    files: Record<string, string>;
    stdin: string;
    compileTimeoutMs?: number;
    runTimeoutMs?: number;
    maxOutputBytes?: number;
}

export interface ProcessResult {
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    truncated: boolean;
    ms: number;
}

export interface RunOutput {
    compile: { ok: boolean; output: string } | null;
    run: ProcessResult | null;
    /** The runner itself could not do its job (bad job, missing toolchain). Not the candidate's fault. */
    error?: string;
    missingToolchain?: boolean;
}

export interface CodeRunner {
    readonly kind: "docker" | "local";
    run(job: RunJob): Promise<RunOutput>;
}

/** Infrastructure trouble: Docker is down, the image is missing, the runner produced garbage. */
export class RunnerUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RunnerUnavailableError";
    }
}
