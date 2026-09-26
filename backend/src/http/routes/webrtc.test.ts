import "../../testing/setup";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../../lib/prisma";
import { config } from "../../config/env";
import { fallbackAnalysis } from "../../interview/jdAnalysis";
import { buildPlan } from "../../interview/planBuilder";
import { setLlmForTesting } from "../../llm/client";
import { resetDatabase } from "../../testing/db";
import { FakeLlm } from "../../testing/fakeLlm";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { setVoiceFactoryForTesting } from "../../webrtc/live";
import { addLive, drainLive, getLive, liveCount, removeLive, resetDrainingForTesting } from "../../webrtc/registry";
import type { VoiceFactory, VoiceHandlers } from "../../webrtc/voice";
import { createApp } from "../app";
import { webrtcRouter } from "./webrtc";

const STRONG = "correct-horse-battery-9";
const OFFER = { sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n", type: "offer" };
let server: TestServer;
let opened = 0;

const factory: VoiceFactory = async (_offer, _params, handlers: VoiceHandlers) => {
    opened++;
    const voice = {
        isClosed: false, queuedMs: 0, candidateSpeaking: false,
        async beginSpeech() {}, speak() {}, endSpeech() {}, stopSpeech() {}, onFirstAudio() {}, onPlaybackStart: () => () => undefined, playedFraction: () => 0,
        async drained() {}, send: () => true,
        close() { if (!voice.isClosed) { voice.isClosed = true; handlers.onClosed("closed"); } },
    };
    return { voice, answer: { sdp: "v=0 answer", type: "answer" } };
};

before(async () => {
    server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [webrtcRouter] }));
});
after(async () => {
    await server.close();
    await prisma.$disconnect();
});
beforeEach(async () => {
    await resetDatabase();
    opened = 0;
    setVoiceFactoryForTesting(factory);
    setLlmForTesting(new FakeLlm("Hello there. Please introduce yourself."));
});
afterEach(async () => {
    setVoiceFactoryForTesting(null);
    setLlmForTesting(null);
    resetDrainingForTesting();
    const live = getLive(lastId);
    if (live) await live.finalize("candidate_ended");
});

let lastId = "";

async function signedIn(email: string) {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/signup", { email, password: STRONG, name: "Sam Rivera" });
    client.accessToken = res.body.accessToken;
    return { client, userId: res.body.user.id as string };
}

async function interviewFor(userId: string, data: Partial<{ planStatus: "PENDING" | "READY"; status: "CREATED" | "IN_PROGRESS" | "COMPLETED" }> = {}) {
    const role = "Backend Engineer";
    const created = await prisma.interview.create({ data: { userId, targetRole: role, level: "mid", format: "quick", durationMinutes: 20, planStatus: data.planStatus ?? "READY", status: data.status ?? "CREATED" } });
    const plan = buildPlan({ role, level: "mid", format: "quick", analysis: fallbackAnalysis({ role, level: "mid" }), seed: created.id });
    if ((data.planStatus ?? "READY") === "READY") await prisma.interview.update({ where: { id: created.id }, data: { plan: plan as never } });
    lastId = created.id;
    return created.id;
}

describe("POST /api/webrtc/offer", () => {
    test("needs sign-in, a valid body and an interview the caller owns", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);

        assert.equal((await new TestClient(server.url).post("/api/webrtc/offer", { ...OFFER, interviewId: id })).status, 401);
        assert.equal((await client.post("/api/webrtc/offer", { type: "offer", interviewId: id })).status, 400);
        assert.equal((await client.post("/api/webrtc/offer", { ...OFFER, type: "answer", interviewId: id })).status, 400);
        assert.equal((await client.post("/api/webrtc/offer", { ...OFFER, interviewId: "nope" })).status, 400);
        assert.equal((await client.post("/api/webrtc/offer", { ...OFFER, sdp: "x".repeat(60_000), interviewId: id })).status, 400);

        const { client: other } = await signedIn("b@example.com");
        assert.equal((await other.post("/api/webrtc/offer", { ...OFFER, interviewId: id })).status, 404);
        assert.equal(opened, 0);
    });

    test("refuses an interview whose plan is not ready or which already ended", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const pending = await interviewFor(userId, { planStatus: "PENDING" });
        const notReady = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: pending });
        assert.equal(notReady.status, 409);
        assert.equal(notReady.body.code, "not_ready");

        const done = await interviewFor(userId, { status: "COMPLETED" });
        const ended = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: done });
        assert.equal(ended.status, 409);
        assert.equal(ended.body.code, "already_ended");
    });

    test("starts the call, registers it, and resumes the same interview on a second offer", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);

        const first = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
        assert.equal(first.status, 200);
        assert.equal(first.body.type, "answer");
        const live = getLive(id);
        assert.ok(live);
        assert.equal(liveCount(), 1);

        const second = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
        assert.equal(second.status, 200);
        assert.equal(getLive(id), live, "the same interview object carries on");
        assert.equal(opened, 2);
        assert.equal(liveCount(), 1);
    });

    test("an interview left in progress by a dead server is closed honestly, not resumed", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId, { status: "IN_PROGRESS" });
        const res = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
        assert.equal(res.status, 409);
        assert.equal(res.body.code, "interrupted");
        const row = await prisma.interview.findUniqueOrThrow({ where: { id } });
        assert.equal(row.status, "ABANDONED");
        assert.equal(row.endReason, "interrupted");
    });

    test("sheds load with a Retry-After when the instance is full", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);
        const placeholders = Array.from({ length: config.maxConcurrentInterviews }, (_, i) => `full-${i}`);
        for (const key of placeholders) addLive(key, {} as never);
        try {
            const res = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
            assert.equal(res.status, 503);
            assert.equal(res.body.code, "at_capacity");
            assert.ok(res.headers.get("retry-after"));
        } finally {
            for (const key of placeholders) removeLive(key);
        }
    });

    test("a failed voice connection leaves nothing behind and a clear message", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);
        setVoiceFactoryForTesting(async () => { throw new Error("Deepgram unreachable"); });
        const res = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
        assert.equal(res.status, 503);
        assert.equal(res.body.code, "voice_unavailable");
        assert.ok(!JSON.stringify(res.body).includes("Deepgram"), "no internals leak");
        assert.equal(getLive(id), undefined);
        assert.equal(liveCount(), 0);
        assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id } })).status, "CREATED");
    });

    test("a draining server refuses new calls", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);
        await drainLive(0);
        const res = await client.post("/api/webrtc/offer", { ...OFFER, interviewId: id });
        assert.equal(res.status, 503);
        assert.equal(res.body.code, "draining");
    });
});

describe("POST /api/interviews/:id/end", () => {
    test("ends a live interview, or closes one that has no live call", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const live = await interviewFor(userId);
        await client.post("/api/webrtc/offer", { ...OFFER, interviewId: live });
        assert.equal((await client.post(`/api/interviews/${live}/end`)).status, 200);
        assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: live } })).status, "ABANDONED");
        assert.equal(getLive(live), undefined);

        const orphan = await interviewFor(userId, { status: "IN_PROGRESS" });
        assert.equal((await client.post(`/api/interviews/${orphan}/end`)).status, 200);
        assert.equal((await prisma.interview.findUniqueOrThrow({ where: { id: orphan } })).status, "ABANDONED");

        const { client: stranger } = await signedIn("b@example.com");
        assert.equal((await stranger.post(`/api/interviews/${orphan}/end`)).status, 404);
    });
});
