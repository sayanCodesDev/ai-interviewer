import { prisma } from "../../lib/prisma";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { reportsGenerated } from "../observability/metrics";
import { generateReport } from "./report";

const MAX_ATTEMPTS = 3;
const POLL_MS = 5_000;
const CONCURRENCY = 2;
/** A job claimed this long ago with no result belongs to a worker that died. */
const STALE_CLAIM_MINUTES = 5;

let timer: NodeJS.Timeout | null = null;
let running = 0;
let stopped = true;

/**
 * Takes the next report that needs generating. FOR UPDATE SKIP LOCKED makes this safe across any
 * number of instances: each job goes to exactly one worker, and a crashed worker's claim expires.
 * A failed job waits a little longer before each retry.
 *
 * Prisma stores DateTime as timestamp-without-zone in UTC, so comparisons use UTC "now" explicitly;
 * relying on the database session's time zone would misjudge staleness on any non-UTC server.
 */
export async function claimNextReport(): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "Interview"
        SET "reportStatus" = 'GENERATING', "reportAttempts" = "reportAttempts" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE id = (
            SELECT id FROM "Interview"
            WHERE "reportAttempts" < ${MAX_ATTEMPTS}
              AND (
                ("reportStatus" = 'PENDING' AND ("reportAttempts" = 0 OR "updatedAt" < (now() AT TIME ZONE 'UTC') - interval '20 seconds' * "reportAttempts"))
                OR ("reportStatus" = 'GENERATING' AND "updatedAt" < (now() AT TIME ZONE 'UTC') - make_interval(mins => ${STALE_CLAIM_MINUTES}))
              )
            ORDER BY "endedAt" NULLS LAST
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
    return rows[0]?.id ?? null;
}

async function process(id: string): Promise<void> {
    try {
        await generateReport(id);
        reportsGenerated.inc({ outcome: "ok" });
        logger.info({ interviewId: id }, "Report generated");
    } catch (error) {
        reportsGenerated.inc({ outcome: "error" });
        logger.error({ err: error, interviewId: id }, "Report generation failed");
        const row = await prisma.interview.findUnique({ where: { id }, select: { reportAttempts: true } });
        const exhausted = (row?.reportAttempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
        await prisma.interview.update({
            where: { id },
            data: { reportStatus: exhausted ? "FAILED" : "PENDING", reportError: String((error as Error).message).slice(0, 300) },
        });
    }
}

async function tick(): Promise<void> {
    if (stopped) return;
    try {
        while (running < CONCURRENCY) {
            const id = await claimNextReport();
            if (!id) break;
            running++;
            void process(id).finally(() => {
                running--;
                if (!stopped) setImmediate(() => void tick());
            });
        }
    } catch (error) {
        logger.error({ err: error }, "Report worker could not poll for jobs");
    }
}

/** Starts polling. Every instance may run one; the claim query keeps them from colliding. */
export function startReportWorker(): void {
    if (!stopped || !config.reportWorkerEnabled) return;
    stopped = false;
    timer = setInterval(() => void tick(), POLL_MS);
    timer.unref();
    void tick();
}

export function stopReportWorker(): void {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
}

/** An interview just ended; don't wait for the next poll. */
export function pokeReportWorker(): void {
    if (!stopped) void tick();
}
