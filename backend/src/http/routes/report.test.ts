import "../../testing/setup";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../../lib/prisma";
import { fallbackAnalysis } from "../../interview/jdAnalysis";
import { buildPlan } from "../../interview/planBuilder";
import { resetDatabase } from "../../testing/db";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { createApp } from "../app";
import { interviewsRouter } from "./interviews";

const STRONG = "correct-horse-battery-9";
let server: TestServer;

before(async () => { server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [interviewsRouter] })); });
after(async () => { await server.close(); await prisma.$disconnect(); });
beforeEach(resetDatabase);

async function signedIn(email: string) {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/signup", { email, password: STRONG, name: "Sam" });
    client.accessToken = res.body.accessToken;
    return { client, userId: res.body.user.id as string };
}

async function interview(userId: string, data: Record<string, unknown> = {}) {
    const role = "Backend Engineer";
    const plan = buildPlan({ role, level: "mid", format: "quick", analysis: fallbackAnalysis({ role, level: "mid" }), seed: "r" });
    const row = await prisma.interview.create({ data: { userId, targetRole: role, level: "mid", format: "quick", durationMinutes: 20, planStatus: "READY", plan: plan as never, status: "COMPLETED", startedAt: new Date(Date.now() - 900_000), endedAt: new Date(), ...data } });
    await prisma.interviewTurn.createMany({ data: [
        { interviewId: row.id, seq: 0, role: "SYSTEM", text: "Part 1 of 4: Introduction", offsetMs: 0, roundKey: "1-intro" },
        { interviewId: row.id, seq: 1, role: "INTERVIEWER", text: "Hello, tell me about yourself.", offsetMs: 1000, roundKey: "1-intro" },
        { interviewId: row.id, seq: 2, role: "CANDIDATE", text: "I build backend services.", offsetMs: 9000, roundKey: "1-intro" },
    ] });
    return row.id;
}

describe("GET /api/interviews/:id/report", () => {
    test("returns the transcript straight away and the report once it exists", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interview(userId, { reportStatus: "PENDING" });

        const pending = await client.get(`/api/interviews/${id}/report`);
        assert.equal(pending.status, 200);
        assert.equal(pending.body.status, "PENDING");
        assert.equal(pending.body.report, null);
        assert.equal(pending.body.transcript.length, 3);
        assert.deepEqual(pending.body.transcript.map((t: any) => t.role), ["system", "interviewer", "candidate"]);
        assert.equal(pending.body.interview.rounds[0].type, "intro");

        await prisma.report.create({ data: { interviewId: id, overallScore: 72, band: "Close", summary: "s", data: { version: 1, overall: { score: 72 } }, model: "m", promptVersion: "v" } });
        await prisma.interview.update({ where: { id }, data: { reportStatus: "READY" } });
        const ready = await client.get(`/api/interviews/${id}/report`);
        assert.equal(ready.body.status, "READY");
        assert.equal(ready.body.report.overall.score, 72);
    });

    test("an abandoned interview has a transcript but no report", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interview(userId, { status: "ABANDONED", reportStatus: "NONE" });
        const res = await client.get(`/api/interviews/${id}/report`);
        assert.equal(res.body.status, "NONE");
        assert.equal(res.body.report, null);
    });

    test("is refused while the interview is still going, and for anyone else", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const live = await interview(userId, { status: "IN_PROGRESS", endedAt: null, reportStatus: "NONE" });
        assert.equal((await client.get(`/api/interviews/${live}/report`)).status, 409);

        const done = await interview(userId);
        const { client: other } = await signedIn("b@example.com");
        assert.equal((await other.get(`/api/interviews/${done}/report`)).status, 404);
        assert.equal((await other.post(`/api/interviews/${done}/report/retry`)).status, 404);
    });
});

describe("POST /api/interviews/:id/report/retry", () => {
    test("re-queues only a failed report", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const failed = await interview(userId, { reportStatus: "FAILED", reportAttempts: 3, reportError: "boom" });
        const ok = await client.post(`/api/interviews/${failed}/report/retry`);
        assert.equal(ok.status, 200);
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: failed } });
        assert.equal(row.reportStatus, "PENDING");
        assert.equal(row.reportAttempts, 0);

        assert.equal((await client.post(`/api/interviews/${failed}/report/retry`)).status, 409);
        const shown = await client.get(`/api/interviews/${failed}/report`);
        assert.ok(!JSON.stringify(shown.body).includes("boom"), "internal error text is never shown");
    });
});
