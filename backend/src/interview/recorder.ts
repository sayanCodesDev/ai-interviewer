import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { logger } from "../observability/logger";
import type { Utterance } from "./conductor";
import type { TestRun } from "./problems";

const FLUSH_INTERVAL_MS = 3_000;
const MAX_RUN_ROWS_PER_INTERVIEW = 60;

type TurnRow = Prisma.InterviewTurnCreateManyInput;

/** Hidden cases keep only their label and outcome, so a stored row can't leak them either. */
function storedResults(run: TestRun): Prisma.InputJsonValue {
    return run.cases.map((c) => ({
        id: c.id,
        label: c.label ?? null,
        hidden: c.hidden,
        status: c.status,
        ...(c.hidden ? {} : { actual: c.actual ?? null, expected: c.expected ?? null, error: c.error ?? null }),
    })) as Prisma.InputJsonValue;
}

/**
 * Writes an interview's transcript to Postgres without ever making the conversation wait for the
 * database. Turns are queued and flushed in batches; a failed flush stays queued and is retried,
 * and the (interviewId, seq) key makes retries harmless.
 */
export class InterviewRecorder {
    private seq = 0;
    private queue: TurnRow[] = [];
    private timer: NodeJS.Timeout | null = null;
    private flushing: Promise<void> | null = null;
    private runRows = 0;

    constructor(private readonly interviewId: string, private readonly startedAt: number, startSeq = 0) {
        this.seq = startSeq;
        this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
        this.timer.unref();
    }

    addTurn(utterance: Utterance): void {
        this.queue.push({
            interviewId: this.interviewId,
            seq: this.seq++,
            role: utterance.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE",
            roundKey: utterance.roundKey,
            text: utterance.text.slice(0, 8_000),
            offsetMs: Math.max(0, utterance.at - this.startedAt),
            interrupted: utterance.interrupted ?? false,
        });
        if (this.queue.length >= 12) void this.flush();
    }

    /** Persists a code run or submission. Never throws: losing one row must not break the call. */
    async addSubmission(input: {
        problemKey: string;
        kind: "RUN" | "SUBMIT";
        attempt: number;
        language: string;
        code: string;
        run: TestRun;
    }): Promise<void> {
        if (input.kind === "RUN") {
            if (this.runRows >= MAX_RUN_ROWS_PER_INTERVIEW) return;
            this.runRows++;
        }
        try {
            await prisma.codeSubmission.create({
                data: {
                    interviewId: this.interviewId,
                    problemKey: input.problemKey,
                    kind: input.kind,
                    attempt: input.attempt,
                    language: input.language,
                    code: input.code.slice(0, 100_000),
                    passed: input.run.passed,
                    total: input.run.total,
                    status: input.run.status,
                    runtimeMs: input.run.runtimeMs,
                    results: storedResults(input.run),
                },
            });
        } catch (error) {
            logger.error({ err: error, interviewId: this.interviewId }, "Could not record a code submission");
        }
    }

    async flush(): Promise<void> {
        if (this.flushing) return this.flushing;
        if (this.queue.length === 0) return;

        const batch = this.queue.splice(0, this.queue.length);
        this.flushing = (async () => {
            try {
                await prisma.interviewTurn.createMany({ data: batch, skipDuplicates: true });
            } catch (error) {
                logger.error({ err: error, interviewId: this.interviewId, count: batch.length }, "Could not save transcript turns; will retry");
                this.queue.unshift(...batch);
            } finally {
                this.flushing = null;
            }
        })();
        return this.flushing;
    }

    /** Stops the timer and makes a last, retried attempt to save everything. */
    async close(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        for (let attempt = 0; attempt < 3 && (this.queue.length > 0 || this.flushing); attempt++) {
            await this.flush();
            if (this.queue.length > 0) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
}
