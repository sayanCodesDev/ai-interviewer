import "../testing/setup";
import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { setLlmForTesting } from "../llm/client";
import { FakeLlm } from "../testing/fakeLlm";
import { resetDatabase } from "../testing/db";
import { fallbackAnalysis } from "./jdAnalysis";
import { buildPlan } from "./planBuilder";
import { continueInterview, createInterview } from "./service";
import { HttpError } from "../http/errors";

before(async () => { setLlmForTesting(new FakeLlm("{}")); });
beforeEach(resetDatabase);
afterEach(() => undefined);

async function userWith(email: string): Promise<string> {
    const user = await prisma.user.create({ data: { email, name: "Sam", password: "x" } });
    return user.id;
}

const STUDY_PLAN = [
    { topic: "Dynamic programming — knapsack variants", why: "struggled to define the recurrence", actions: ["practise"], priority: "high", resources: [], evidence: [], problemTags: ["dynamic-programming", "recursion"] },
    { topic: "Communication under pressure", why: "went quiet when stuck", actions: ["narrate"], priority: "medium", resources: [], evidence: [], problemTags: [] },
];

/** A completed interview with a report whose study plan matches STUDY_PLAN, for continueInterview to read. */
async function finishedInterview(userId: string, overrides: Record<string, unknown> = {}) {
    const role = "Backend Engineer";
    const plan = buildPlan({ role, level: "mid", format: "quick", analysis: fallbackAnalysis({ role, level: "mid" }), seed: "svc-test" });
    const row = await prisma.interview.create({
        data: {
            userId, targetRole: role, level: "mid", format: "quick", durationMinutes: 20,
            planStatus: "READY", plan: plan as never, status: "COMPLETED",
            jobDescription: "We build backend services on Go and Postgres, and you will own reliability.",
            githubUsername: "octocat", voice: "aura-2-thalia-en", accent: "en",
            ...overrides,
        },
    });
    await prisma.report.create({
        data: {
            interviewId: row.id, overallScore: 62, band: "developing", summary: "Solid start.",
            data: { version: 1, studyPlan: STUDY_PLAN } as never,
            model: "test", promptVersion: "test",
        },
    });
    return row.id;
}

async function waitForReady(id: string) {
    for (let i = 0; i < 100; i++) {
        const row = await prisma.interview.findUniqueOrThrow({ where: { id } });
        if (row.planStatus === "READY") return row;
        if (row.planStatus === "FAILED") throw new Error(`plan failed: ${row.planError}`);
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("plan never became ready");
}

describe("continueInterview: track bookkeeping", () => {
    test("a chosen topic creates a new interview in the same track, one position further on", async () => {
        const userId = await userWith("a@example.com");
        const sourceId = await finishedInterview(userId);
        const source = await prisma.interview.findUniqueOrThrow({ where: { id: sourceId } });

        const { id } = await continueInterview(userId, sourceId, [STUDY_PLAN[0]!.topic]);
        const created = await prisma.interview.findUniqueOrThrow({ where: { id } });

        assert.equal(created.trackId, source.trackId);
        assert.equal(created.trackPosition, source.trackPosition + 1);
        assert.equal(created.continuesFromId, sourceId);
        assert.deepEqual(created.continuesTopics, [STUDY_PLAN[0]!.topic]);
        assert.equal(created.targetRole, source.targetRole);
        assert.equal(created.jobDescription, source.jobDescription);
        assert.equal(created.githubUsername, source.githubUsername);
    });

    test("'all' expands to every study plan topic, not just the first", async () => {
        const userId = await userWith("b@example.com");
        const sourceId = await finishedInterview(userId);
        const { id } = await continueInterview(userId, sourceId, "all");
        const created = await prisma.interview.findUniqueOrThrow({ where: { id } });
        assert.deepEqual(created.continuesTopics.sort(), STUDY_PLAN.map((s) => s.topic).sort());
    });

    test("retrying from an earlier interview in a track still advances the track forward", async () => {
        const userId = await userWith("c@example.com");
        const first = await finishedInterview(userId);
        const second = await continueInterview(userId, first, "all");
        const secondRow = await prisma.interview.findUniqueOrThrow({ where: { id: second.id } });
        // A hand-crafted third report on the second interview, then retry from the FIRST again.
        await prisma.report.create({ data: { interviewId: second.id, overallScore: 70, band: "close", summary: "x", data: { version: 1, studyPlan: STUDY_PLAN } as never, model: "test", promptVersion: "test" } });
        const third = await continueInterview(userId, first, "all");
        const thirdRow = await prisma.interview.findUniqueOrThrow({ where: { id: third.id } });
        assert.equal(thirdRow.trackId, secondRow.trackId);
        assert.ok(thirdRow.trackPosition > secondRow.trackPosition, "position must move forward, not collide");
    });

    test("a fresh interview from Setup is its own standalone track, unaffected by any of this", async () => {
        const userId = await userWith("d@example.com");
        const setup = { role: "Backend Engineer", level: "mid" as const, format: "quick" as const, jobDescription: "We build backend services on Go and Postgres, and you will own reliability and design.", githubUrl: "octocat", voice: "aura-2-thalia-en", accent: "en" };
        const a = await createInterview(userId, setup);
        const b = await createInterview(userId, setup);
        const rowA = await prisma.interview.findUniqueOrThrow({ where: { id: a.id } });
        const rowB = await prisma.interview.findUniqueOrThrow({ where: { id: b.id } });

        assert.ok(rowA.trackId, "a standalone interview still gets a track of its own");
        assert.notEqual(rowA.trackId, rowB.trackId, "two unrelated fresh interviews are never in the same track");
        assert.equal(rowA.trackPosition, 1);
        assert.equal(rowA.continuesFromId, null);
        assert.deepEqual(rowA.continuesTopics, []);
    });
});

describe("continueInterview: errors", () => {
    test("refuses to continue an interview with no report yet", async () => {
        const userId = await userWith("e@example.com");
        const sourceId = await finishedInterview(userId);
        await prisma.report.delete({ where: { interviewId: sourceId } });
        await assert.rejects(continueInterview(userId, sourceId, "all"), (err) => err instanceof HttpError && err.code === "no_report");
    });

    test("a stranger cannot continue someone else's interview", async () => {
        const owner = await userWith("f@example.com");
        const stranger = await userWith("g@example.com");
        const sourceId = await finishedInterview(owner);
        await assert.rejects(continueInterview(stranger, sourceId, "all"), (err) => err instanceof HttpError && err.status === 404);
    });

    test("topics that don't match the study plan are dropped, and an empty result is refused", async () => {
        const userId = await userWith("h@example.com");
        const sourceId = await finishedInterview(userId);
        await assert.rejects(continueInterview(userId, sourceId, ["not a real topic"]), (err) => err instanceof HttpError && err.code === "no_topics");
    });
});

describe("continueInterview: the retry actually leans toward the chosen topic", () => {
    test("problem selection is weighted toward the coding tags of the topic that was picked", async () => {
        const userId = await userWith("i@example.com");
        const sourceId = await finishedInterview(userId, { format: "standard" });
        const { id } = await continueInterview(userId, sourceId, [STUDY_PLAN[0]!.topic]);
        const row = await waitForReady(id);
        const plan = row.plan as { selection: { tags: Record<string, number> } };
        const weight = plan.selection.tags["dynamic-programming"] ?? 0;
        assert.ok(weight > 3, `expected a strong weight, got ${weight}`);
    });
});
