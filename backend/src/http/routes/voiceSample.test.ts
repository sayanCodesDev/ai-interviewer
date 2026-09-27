import "../../testing/setup";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../../lib/prisma";
import { config } from "../../config/env";
import { resetDatabase } from "../../testing/db";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { setSampleSynthesizerForTesting } from "../../voice/tts";
import { createApp } from "../app";
import { interviewsRouter } from "./interviews";

let server: TestServer;
const originalMode = config.voiceMode;
const originalKey = config.deepgramApiKey;

before(async () => { server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [interviewsRouter] })); });
after(async () => {
    config.voiceMode = originalMode;
    config.deepgramApiKey = originalKey;
    setSampleSynthesizerForTesting(null);
    await server.close();
    await prisma.$disconnect();
});
beforeEach(async () => { await resetDatabase(); setSampleSynthesizerForTesting(null); });

async function signedIn(email: string) {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/signup", { email, password: "correct-horse-battery-9", name: "Sam" });
    client.accessToken = res.body.accessToken;
    return { client, userId: res.body.user.id as string };
}
const interviewFor = (userId: string, voice = "aura-2-thalia-en") => prisma.interview.create({ data: { userId, targetRole: "Backend Engineer", level: "mid", format: "quick", durationMinutes: 20, voice } }).then((r) => r.id);

describe("GET /api/interviews/:id/voice-sample", () => {
    test("plays a sample in the interview's voice, and makes each voice only once", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        const calls: string[] = [];
        setSampleSynthesizerForTesting(async (voice) => { calls.push(voice); return Buffer.from("ID3-fake-mp3"); });
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId, "aura-2-luna-en");

        const first = await client.get(`/api/interviews/${id}/voice-sample`);
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("content-type"), "audio/mpeg");
        await client.get(`/api/interviews/${id}/voice-sample`);
        assert.deepEqual(calls, ["aura-2-luna-en"], "synthesised once, then served from memory");
    });

    test("is unavailable in text mode or without a speech key, with a clear message", async () => {
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);
        config.voiceMode = "text";
        config.deepgramApiKey = "test-key";
        const res = await client.get(`/api/interviews/${id}/voice-sample`);
        assert.equal(res.status, 503);
        assert.equal(res.body.code, "voice_unavailable");
    });

    test("a failing speech service gives a plain 503 and is not remembered", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        let fail = true;
        setSampleSynthesizerForTesting(async () => { if (fail) throw new Error("upstream said 500"); return Buffer.from("ok"); });
        const { client, userId } = await signedIn("a@example.com");
        const id = await interviewFor(userId);
        const bad = await client.get(`/api/interviews/${id}/voice-sample`);
        assert.equal(bad.status, 503);
        assert.doesNotMatch(JSON.stringify(bad.body), /upstream/);
        fail = false;
        assert.equal((await client.get(`/api/interviews/${id}/voice-sample`)).status, 200);
    });

    test("only the owner can ask for it", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        setSampleSynthesizerForTesting(async () => Buffer.from("x"));
        const alice = await signedIn("alice@example.com");
        const bob = await signedIn("bob@example.com");
        const id = await interviewFor(alice.userId);
        assert.equal((await bob.client.get(`/api/interviews/${id}/voice-sample`)).status, 404);
        assert.equal((await new TestClient(server.url).get(`/api/interviews/${id}/voice-sample`)).status, 401);
    });
});

describe("GET /api/voices/:voiceId/sample", () => {
    test("plays a sample of any offered voice, with no interview needed, and caches per voice", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        const calls: string[] = [];
        setSampleSynthesizerForTesting(async (voice) => { calls.push(voice); return Buffer.from("ID3-fake-mp3"); });
        const { client } = await signedIn("a@example.com");

        const first = await client.get("/api/voices/aura-2-luna-en/sample");
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("content-type"), "audio/mpeg");
        await client.get("/api/voices/aura-2-luna-en/sample");
        assert.deepEqual(calls, ["aura-2-luna-en"], "synthesised once, then served from memory");

        await client.get("/api/voices/aura-2-zeus-en/sample");
        assert.deepEqual(calls, ["aura-2-luna-en", "aura-2-zeus-en"], "a different voice is synthesised separately");
    });

    test("rejects a voice that isn't offered", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        setSampleSynthesizerForTesting(async () => Buffer.from("x"));
        const { client } = await signedIn("a@example.com");
        const res = await client.get("/api/voices/not-a-real-voice/sample");
        assert.equal(res.status, 400);
    });

    test("needs signing in, but not an interview", async () => {
        config.voiceMode = "live";
        config.deepgramApiKey = "test-key";
        setSampleSynthesizerForTesting(async () => Buffer.from("x"));
        assert.equal((await new TestClient(server.url).get("/api/voices/aura-2-luna-en/sample")).status, 401);
    });

    test("is unavailable in text mode or without a speech key, with a clear message", async () => {
        const { client } = await signedIn("a@example.com");
        config.voiceMode = "text";
        config.deepgramApiKey = "test-key";
        const res = await client.get("/api/voices/aura-2-luna-en/sample");
        assert.equal(res.status, 503);
        assert.equal(res.body.code, "voice_unavailable");
    });
});
