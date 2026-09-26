import "./testing/setup";
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import { prisma } from "../lib/prisma";
import { closeOrphanedInterviews, deleteExpiredInterviews } from "./maintenance";
import { resetDatabase } from "./testing/db";

after(() => prisma.$disconnect());
beforeEach(resetDatabase);

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function user() {
    return (await prisma.user.create({ data: { email: `m${Math.random()}@example.com`, password: "x" } })).id;
}

async function interview(userId: string, data: Record<string, unknown>) {
    return prisma.interview.create({ data: { userId, targetRole: "Backend Engineer", level: "mid", format: "quick", durationMinutes: 20, ...data } as never });
}

describe("data retention", () => {
    test("removes finished interviews past the retention period along with their transcripts, code and reports", async () => {
        const userId = await user();
        const old = await interview(userId, { status: "COMPLETED", createdAt: new Date(now - 200 * DAY) });
        const recent = await interview(userId, { status: "COMPLETED", createdAt: new Date(now - 10 * DAY) });
        await prisma.interviewTurn.create({ data: { interviewId: old.id, seq: 0, role: "CANDIDATE", text: "hello", offsetMs: 0 } });
        await prisma.codeSubmission.create({ data: { interviewId: old.id, problemKey: "two-sum", kind: "SUBMIT", language: "python", code: "x", status: "PASSED" } });
        await prisma.report.create({ data: { interviewId: old.id, overallScore: 50, band: "Developing", summary: "s", data: {}, model: "m", promptVersion: "1" } });

        assert.equal(await deleteExpiredInterviews(180, now), 1);
        assert.equal(await prisma.interview.count({ where: { id: old.id } }), 0);
        assert.equal(await prisma.interviewTurn.count(), 0, "the transcript went with it");
        assert.equal(await prisma.codeSubmission.count(), 0);
        assert.equal(await prisma.report.count(), 0);
        assert.equal(await prisma.interview.count({ where: { id: recent.id } }), 1, "recent interviews are kept");
        assert.equal(await prisma.user.count(), 1, "the account itself is not touched");
    });

    test("never deletes an interview that is still in progress, however old", async () => {
        const userId = await user();
        await interview(userId, { status: "IN_PROGRESS", createdAt: new Date(now - 400 * DAY), startedAt: new Date(now - 400 * DAY) });
        assert.equal(await deleteExpiredInterviews(180, now), 0);
        assert.equal(await prisma.interview.count(), 1);
    });

    test("a retention of zero days keeps everything, except interviews that were never started", async () => {
        const userId = await user();
        await interview(userId, { status: "COMPLETED", createdAt: new Date(now - 900 * DAY) });
        await interview(userId, { status: "CREATED", createdAt: new Date(now - 30 * DAY) });
        await interview(userId, { status: "CREATED", createdAt: new Date(now - 1 * DAY) });
        assert.equal(await deleteExpiredInterviews(0, now), 1, "only the old, never-started one");
        assert.equal(await prisma.interview.count(), 2);
    });

    test("works through more interviews than one batch", async () => {
        const userId = await user();
        await prisma.interview.createMany({
            data: Array.from({ length: 230 }, () => ({ userId, targetRole: "x", level: "mid", format: "quick", durationMinutes: 20, status: "ABANDONED" as const, createdAt: new Date(now - 300 * DAY) })),
        });
        assert.equal(await deleteExpiredInterviews(180, now), 230);
    });
});

describe("orphaned interviews", () => {
    test("a call that died long ago is closed out, and gets a report if there was enough conversation", async () => {
        const userId = await user();
        const started = new Date(now - 5 * 60 * 60 * 1000);
        const talked = await interview(userId, { status: "IN_PROGRESS", startedAt: started, planStatus: "READY" });
        const silent = await interview(userId, { status: "IN_PROGRESS", startedAt: started, planStatus: "READY" });
        const running = await interview(userId, { status: "IN_PROGRESS", startedAt: new Date(now - 10 * 60 * 1000), planStatus: "READY" });
        for (let seq = 0; seq < 4; seq++) await prisma.interviewTurn.create({ data: { interviewId: talked.id, seq, role: "CANDIDATE", text: "an answer", offsetMs: seq * 1000 } });

        assert.equal(await closeOrphanedInterviews(now), 2);

        const rows = new Map((await prisma.interview.findMany()).map((r) => [r.id, r]));
        assert.equal(rows.get(talked.id)!.status, "COMPLETED");
        assert.equal(rows.get(talked.id)!.reportStatus, "PENDING");
        assert.equal(rows.get(talked.id)!.endReason, "interrupted");
        assert.equal(rows.get(silent.id)!.status, "ABANDONED");
        assert.equal(rows.get(silent.id)!.reportStatus, "NONE");
        assert.equal(rows.get(running.id)!.status, "IN_PROGRESS", "a call that is still within its time is left alone");
    });
});
