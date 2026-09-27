import "../../testing/setup";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../../lib/prisma";
import { config } from "../../config/env";
import { setGithubFetchForTesting } from "../../interview/github";
import { setLlmForTesting } from "../../llm/client";
import { FakeLlm } from "../../testing/fakeLlm";
import { resetDatabase } from "../../testing/db";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { createApp } from "../app";
import { interviewsRouter } from "./interviews";

const STRONG = "correct-horse-battery-9";
let server: TestServer;

before(async () => {
    server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [interviewsRouter] }));
});
after(async () => {
    await server.close();
    await prisma.$disconnect();
});
/** GitHub, as the tests see it: two accounts, one of which does not exist, and an outage on demand. */
let githubDown = false;
const fakeGithub = (async (input: string | URL | Request) => {
    const url = String(input);
    if (githubDown) return new Response("rate limited", { status: 403 });
    if (/\/users\/[^/]+\/repos/.test(url)) return Response.json([]);
    if (/\/users\/(octocat|torvalds)$/i.test(url)) return Response.json({ login: "octocat" });
    return new Response("not found", { status: 404 });
}) as typeof fetch;

beforeEach(async () => {
    await resetDatabase();
    githubDown = false;
    setGithubFetchForTesting(fakeGithub);
    setLlmForTesting(new FakeLlm("{}"));
});
afterEach(() => {
    setLlmForTesting(null);
    setGithubFetchForTesting(null);
});

async function signedIn(email: string): Promise<TestClient> {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/signup", { email, password: STRONG, name: "Test" });
    client.accessToken = res.body.accessToken;
    return client;
}

const JOB_DESCRIPTION = "Backend engineer for our payments platform. You will build Go services on PostgreSQL and Kafka, own their reliability, and mentor the team.";
const SETUP = { role: "Backend Engineer", level: "mid", format: "standard", jobDescription: JOB_DESCRIPTION, githubUrl: "https://github.com/octocat" };

async function waitForPlan(client: TestClient, id: string) {
    for (let i = 0; i < 60; i++) {
        const res = await client.get(`/api/interviews/${id}`);
        if (res.body.planStatus === "READY") return res.body;
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("plan never became ready");
}

describe("creating an interview", () => {
    test("requires sign-in and validates every field", async () => {
        const anon = new TestClient(server.url);
        assert.equal((await anon.post("/api/interviews", SETUP)).status, 401);

        const client = await signedIn("a@example.com");
        const badRole = await client.post("/api/interviews", { ...SETUP, role: "Astronaut" });
        assert.equal(badRole.status, 400);
        assert.ok(badRole.body.fields.role);

        assert.equal((await client.post("/api/interviews", { ...SETUP, level: "wizard" })).status, 400);
        assert.equal((await client.post("/api/interviews", { ...SETUP, format: "forever" })).status, 400);
        assert.equal((await client.post("/api/interviews", { ...SETUP, jobDescription: "x".repeat(6_001) })).status, 400);
        assert.equal((await client.post("/api/interviews", { ...SETUP, githubUrl: "../../etc/passwd" })).status, 400);
        assert.equal(await prisma.interview.count(), 0);
    });

    test("the job description is required, and must be long enough to mean something", async () => {
        const client = await signedIn("a@example.com");
        const { jobDescription: _jd, ...withoutJd } = SETUP;
        const missing = await client.post("/api/interviews", withoutJd);
        assert.equal(missing.status, 400);
        assert.match(missing.body.fields.jobDescription, /Paste the job description/);

        const blank = await client.post("/api/interviews", { ...SETUP, jobDescription: "   " });
        assert.equal(blank.status, 400);
        assert.ok(blank.body.fields.jobDescription);

        const short = await client.post("/api/interviews", { ...SETUP, jobDescription: "Backend dev" });
        assert.equal(short.status, 400);
        assert.match(short.body.fields.jobDescription, /too short/);
        assert.equal(await prisma.interview.count(), 0);
    });

    test("GitHub is required, and the account must exist", async () => {
        const client = await signedIn("a@example.com");
        const { githubUrl: _github, ...withoutGithub } = SETUP;
        const missing = await client.post("/api/interviews", withoutGithub);
        assert.equal(missing.status, 400);
        assert.match(missing.body.fields.githubUrl, /Add your GitHub profile/);
        assert.equal((await client.post("/api/interviews", { ...SETUP, githubUrl: "" })).status, 400);

        const ghost = await client.post("/api/interviews", { ...SETUP, githubUrl: "https://github.com/nobody-has-this-name" });
        assert.equal(ghost.status, 400);
        assert.equal(ghost.body.code, "github_not_found");
        assert.match(ghost.body.fields.githubUrl, /nobody-has-this-name/);
        assert.equal(await prisma.interview.count(), 0);

        // A bare username works too, and is stored as the username alone.
        const bare = await client.post("/api/interviews", { ...SETUP, githubUrl: "torvalds" });
        assert.equal(bare.status, 201);
        const stored = await prisma.interview.findUniqueOrThrow({ where: { id: bare.body.id } });
        assert.equal(stored.githubUsername, "torvalds");
    });

    test("when GitHub itself cannot be asked, a candidate is not blocked from starting", async () => {
        githubDown = true;
        const client = await signedIn("a@example.com");
        const res = await client.post("/api/interviews", SETUP);
        assert.equal(res.status, 201);
    });

    test("creates the interview and prepares a plan in the background", async () => {
        const client = await signedIn("a@example.com");
        const created = await client.post("/api/interviews", SETUP);
        assert.equal(created.status, 201);

        const ready = await waitForPlan(client, created.body.id);
        assert.equal(ready.status, "CREATED");
        assert.equal(ready.plan.rounds[0].type, "intro");
        assert.equal(ready.plan.totalMinutes, 45);
        // The client sees the shape of the interview, never the questions.
        assert.ok(!JSON.stringify(ready).includes("lookFor"));
        assert.ok(!JSON.stringify(ready).includes("prompt"));
        const stored = await prisma.interview.findUniqueOrThrow({ where: { id: created.body.id } });
        assert.equal(stored.planStatus, "READY");
        assert.ok(stored.plan);
    });

    test("accepts a job description and a text resume", async () => {
        const client = await signedIn("a@example.com");
        const form = new FormData();
        for (const [k, v] of Object.entries({ ...SETUP, jobDescription: "We build payment systems in Go and Postgres, and we own reliability end to end." })) form.append(k, v);
        form.append("resume", new Blob(["Jane Doe. Senior engineer. Built payment systems in Go for six years."], { type: "text/plain" }), "cv.txt");

        const res = await fetch(`${server.url}/api/interviews`, { method: "POST", headers: { Authorization: `Bearer ${client.accessToken}`, Origin: "http://localhost:3000" }, body: form });
        assert.equal(res.status, 201);
        const { id } = (await res.json()) as { id: string };
        const stored = await prisma.interview.findUniqueOrThrow({ where: { id } });
        assert.match(stored.resumeText ?? "", /payment systems in Go/);
        assert.match(stored.jobDescription ?? "", /Postgres/);
    });

    test("rejects a resume that is the wrong type or too large", async () => {
        const client = await signedIn("a@example.com");
        const send = async (blob: Blob, name: string) => {
            const form = new FormData();
            for (const [k, v] of Object.entries(SETUP)) form.append(k, v);
            form.append("resume", blob, name);
            return fetch(`${server.url}/api/interviews`, { method: "POST", headers: { Authorization: `Bearer ${client.accessToken}`, Origin: "http://localhost:3000" }, body: form });
        };
        const exe = await send(new Blob([new Uint8Array([0x4d, 0x5a, 0, 0, 1, 2, 3, 0, 0, 0, 5, 6])], { type: "application/octet-stream" }), "cv.exe");
        assert.equal(exe.status, 400);
        const big = await send(new Blob([new Uint8Array(3 * 1024 * 1024).fill(65)], { type: "text/plain" }), "cv.txt");
        assert.equal(big.status, 413);
        assert.equal(await prisma.interview.count(), 0);
    });

    test("enforces the daily limit", async () => {
        const client = await signedIn("a@example.com");
        const limit = config.maxInterviewsPerDay;
        for (let i = 0; i < limit; i++) assert.equal((await client.post("/api/interviews", SETUP)).status, 201);
        const over = await client.post("/api/interviews", SETUP);
        assert.equal(over.status, 429);
        assert.equal(over.body.code, "daily_limit");
    });
});

describe("ownership", () => {
    test("another user's interview looks exactly like one that does not exist", async () => {
        const owner = await signedIn("owner@example.com");
        const other = await signedIn("other@example.com");
        const { id } = (await owner.post("/api/interviews", SETUP)).body;

        for (const [method, path] of [["GET", `/api/interviews/${id}`], ["DELETE", `/api/interviews/${id}`]] as const) {
            const res = await other.request(method, path);
            assert.equal(res.status, 404, `${method} ${path}`);
        }
        const missing = await other.get("/api/interviews/00000000-0000-4000-8000-000000000000");
        assert.equal(missing.status, 404);
        assert.equal(missing.body.msg, (await other.get(`/api/interviews/${id}`)).body.msg);

        const run = await other.post(`/api/interviews/${id}/run`, { problemKey: "two-sum", language: "python", code: "x", mode: "examples" });
        assert.equal(run.status, 404);

        assert.equal((await other.get("/api/interviews")).body.items.length, 0);
        assert.equal((await owner.get("/api/interviews")).body.items.length, 1);
        assert.equal(await prisma.interview.count(), 1, "nothing was deleted");
    });

    test("malformed ids are a 400, not a database error", async () => {
        const client = await signedIn("a@example.com");
        assert.equal((await client.get("/api/interviews/not-a-uuid")).status, 400);
        assert.equal((await client.get("/api/interviews/1; DROP TABLE users")).status, 400);
    });

    test("deleting an interview removes its transcript and submissions", async () => {
        const client = await signedIn("a@example.com");
        const { id } = (await client.post("/api/interviews", SETUP)).body;
        await prisma.interviewTurn.create({ data: { interviewId: id, seq: 0, role: "CANDIDATE", text: "hello", offsetMs: 1 } });
        assert.equal((await client.request("DELETE", `/api/interviews/${id}`)).status, 200);
        assert.equal(await prisma.interviewTurn.count(), 0);
        assert.equal(await prisma.interview.count(), 0);
    });
});

describe("listing", () => {
    test("pages newest first with a cursor", async () => {
        const client = await signedIn("a@example.com");
        for (let i = 0; i < 3; i++) await client.post("/api/interviews", SETUP);
        const first = await client.get("/api/interviews?limit=2");
        assert.equal(first.body.items.length, 2);
        assert.ok(first.body.nextCursor);
        const second = await client.get(`/api/interviews?limit=2&cursor=${first.body.nextCursor}`);
        assert.equal(second.body.items.length, 1);
        assert.equal(second.body.nextCursor, null);
        const ids = [...first.body.items, ...second.body.items].map((i: any) => i.id);
        assert.equal(new Set(ids).size, 3);
    });
});

describe("running code from the editor", () => {
    async function liveInterview(client: TestClient) {
        const { id } = (await client.post("/api/interviews", { ...SETUP, format: "quick", level: "junior" })).body;
        const ready = await waitForPlan(client, id);
        await prisma.interview.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
        const stored = await prisma.interview.findUniqueOrThrow({ where: { id } });
        const problemKey = (stored.plan as any).rounds.flatMap((r: any) => r.items).find((i: any) => i.kind === "coding").problemKey as string;
        return { id, problemKey, ready };
    }

    test("only during a live interview, and only for problems in the plan", async () => {
        const client = await signedIn("a@example.com");
        const { id } = (await client.post("/api/interviews", { ...SETUP, format: "quick" })).body;
        await waitForPlan(client, id);
        const before = await client.post(`/api/interviews/${id}/run`, { problemKey: "two-sum", language: "javascript", code: "x", mode: "examples" });
        assert.equal(before.status, 409);

        await prisma.interview.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
        const planned = ((await prisma.interview.findUniqueOrThrow({ where: { id } })).plan as any).rounds.flatMap((r: any) => r.items).filter((i: any) => i.kind === "coding").map((i: any) => i.problemKey);
        const notInPlan = ["two-sum", "valid-parentheses", "climbing-stairs"].find((k) => !planned.includes(k))!;
        const stranger = await client.post(`/api/interviews/${id}/run`, { problemKey: notInPlan, language: "javascript", code: "x", mode: "examples" });
        assert.equal(stranger.status, 404);
        assert.equal(stranger.body.code, "unknown_problem");
    });

    test("grades the visible examples and never returns hidden data", async () => {
        const client = await signedIn("a@example.com");
        const { id, problemKey } = await liveInterview(client);
        const { getProblemDef } = await import("../../interview/problems");
        const { JS_SOLUTIONS } = await import("../../interview/problems/verify/jsSolutions");
        const def = getProblemDef(problemKey)!;

        const good = await client.post(`/api/interviews/${id}/run`, { problemKey, language: "javascript", code: JS_SOLUTIONS[problemKey], mode: "examples" });
        assert.equal(good.status, 200, JSON.stringify(good.body));
        assert.equal(good.body.run.status, "PASSED");
        assert.equal(good.body.run.total, def.examples.length);
        assert.ok(!JSON.stringify(good.body).includes("hidden\":true"));

        const wrong = await client.post(`/api/interviews/${id}/run`, { problemKey, language: "javascript", code: "function nothing() {}", mode: "examples" });
        assert.equal(wrong.status, 200);
        assert.notEqual(wrong.body.run.status, "PASSED");

        const rows = await prisma.codeSubmission.findMany({ where: { interviewId: id } });
        assert.equal(rows.length, 2);
        assert.ok(rows.every((r) => r.kind === "RUN"));
    });

    test("custom input is validated against the problem's types", async () => {
        const client = await signedIn("a@example.com");
        const { id, problemKey } = await liveInterview(client);
        const bad = await client.post(`/api/interviews/${id}/run`, { problemKey, language: "javascript", code: "function f(){}", mode: "custom", args: ["not", "right"] });
        assert.equal(bad.status, 400);
        assert.ok(bad.body.fields.args);
    });

    test("rejects oversized code and unknown languages", async () => {
        const client = await signedIn("a@example.com");
        const { id, problemKey } = await liveInterview(client);
        assert.equal((await client.post(`/api/interviews/${id}/run`, { problemKey, language: "javascript", code: "x".repeat(101 * 1024), mode: "examples" })).status, 400);
        assert.equal((await client.post(`/api/interviews/${id}/run`, { problemKey, language: "cobol", code: "x", mode: "examples" })).status, 400);
    });
});

describe("options", () => {
    test("the setup form can load its choices without signing in", async () => {
        const res = await new TestClient(server.url).get("/api/interview-options");
        assert.equal(res.status, 200);
        assert.equal(res.body.roles.length, 12);
        assert.deepEqual(res.body.levels, ["intern", "junior", "mid", "senior", "staff"]);
        assert.ok(res.body.formats.find((f: any) => f.id === "standard").minutes === 45);
        assert.ok(res.body.voices.length >= 4);
    });
});
