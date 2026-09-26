import { prisma } from "../lib/prisma";
import { config } from "./config/env";
import { finishInterview } from "./interview/service";
import { logger } from "./observability/logger";
import { purgeExpiredSessions } from "./auth/sessions";
import { pokeReportWorker } from "./scoring/worker";

const DAY_MS = 24 * 60 * 60 * 1000;
/** No call lasts this long (the longest format is 75 minutes plus a grace period), so an "in progress" interview older than this is orphaned. */
const ORPHAN_AFTER_MS = 3 * 60 * 60 * 1000;
/** An interview that was created but never started is just clutter after a week. */
const NEVER_STARTED_AFTER_MS = 7 * DAY_MS;
const BATCH = 200;

/**
 * Interviews whose call died without anyone coming back (a closed laptop, a crashed server) stay "in progress" forever
 * and never get a report. Close them out; if there was enough conversation, the report is generated as usual.
 */
export async function closeOrphanedInterviews(now = Date.now()): Promise<number> {
    const stale = await prisma.interview.findMany({
        where: { status: "IN_PROGRESS", startedAt: { lt: new Date(now - ORPHAN_AFTER_MS) } },
        select: { id: true },
        take: BATCH,
    });
    let substantiveCount = 0;
    for (const { id } of stale) {
        const { substantive } = await finishInterview(id, "interrupted");
        if (substantive) substantiveCount++;
    }
    if (substantiveCount > 0) pokeReportWorker();
    return stale.length;
}

/**
 * Deletes interviews (and, by cascade, their transcripts, code and reports) older than the retention period, plus
 * interviews that were created and never started. Interviews still in progress are never touched here.
 * Returns the number removed. A retention of 0 days keeps everything.
 */
export async function deleteExpiredInterviews(retentionDays = config.dataRetentionDays, now = Date.now()): Promise<number> {
    let removed = 0;

    const never = await prisma.interview.deleteMany({
        where: { status: "CREATED", createdAt: { lt: new Date(now - NEVER_STARTED_AFTER_MS) } },
    });
    removed += never.count;

    if (retentionDays > 0) {
        for (;;) {
            const old = await prisma.interview.findMany({
                where: { status: { not: "IN_PROGRESS" }, createdAt: { lt: new Date(now - retentionDays * DAY_MS) } },
                select: { id: true },
                take: BATCH,
            });
            if (old.length === 0) break;
            const { count } = await prisma.interview.deleteMany({ where: { id: { in: old.map((row) => row.id) } } });
            removed += count;
            if (count === 0) break;
        }
    }
    return removed;
}

/** One pass of every housekeeping task. Each is independent, so one failing doesn't stop the rest. */
export async function runMaintenance(): Promise<void> {
    const tasks: Array<[string, () => Promise<number>]> = [
        ["closed orphaned interviews", closeOrphanedInterviews],
        ["deleted expired interviews", () => deleteExpiredInterviews()],
        ["purged expired sessions", purgeExpiredSessions],
    ];
    for (const [label, task] of tasks) {
        try {
            const count = await task();
            if (count > 0) logger.info({ count }, `Maintenance: ${label}`);
        } catch (error) {
            logger.warn({ err: error }, `Maintenance failed: ${label}`);
        }
    }
}

let timer: NodeJS.Timeout | null = null;

/** Runs maintenance shortly after boot and then hourly. Safe on every instance: each task is idempotent. */
export function startMaintenance(): void {
    if (timer) return;
    const first = setTimeout(() => void runMaintenance(), 30_000);
    first.unref();
    timer = setInterval(() => void runMaintenance(), 60 * 60 * 1000);
    timer.unref();
}

export function stopMaintenance(): void {
    if (timer) clearInterval(timer);
    timer = null;
}
