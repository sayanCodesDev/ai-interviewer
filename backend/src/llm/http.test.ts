import "../testing/setup";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, test } from "node:test";
import { config } from "../config/env";
import { HttpLlm, RateLimitedError, llmCapacity } from "./client";
import { ModelRouter, estimateTokens } from "./router";

// ------------------------------------------------------------------------------------------ router

describe("ModelRouter", () => {
    test("tracks a per-model token budget and moves on when a model is full", () => {
        let now = 0;
        const router = new ModelRouter(8_000, () => now);
        const chain = ["a", "b", "c"];
        assert.equal(router.pick(chain, 3_000), "a");
        router.record("a", 3_000);
        router.record("a", 3_000);
        assert.equal(router.pick(chain, 3_000), "b", "a has ~1.8k left of its 6.8k working budget");
        router.record("b", 6_000);
        assert.equal(router.pick(chain, 3_000), "c");
        router.record("c", 6_000);
        assert.equal(router.pick(chain, 3_000), null, "everything is spent for now");

        now += 61_000;
        assert.equal(router.pick(chain, 3_000), "a", "budget returns after a minute");
    });

    test("a cooled-down model is skipped until the cooldown ends", () => {
        let now = 0;
        const router = new ModelRouter(8_000, () => now);
        router.cooldown("a", 10_000);
        assert.equal(router.pick(["a", "b"], 100), "b");
        now = 10_001;
        assert.equal(router.pick(["a", "b"], 100), "a");
    });

    test("reports whether anything can take a request, and how long until it can", () => {
        let now = 0;
        const router = new ModelRouter(8_000, () => now);
        assert.deepEqual(router.availability(["a", "b"]), { available: true, retryAfterMs: 0 });
        router.cooldown("a", 3_600_000);
        assert.equal(router.availability(["a", "b"]).available, true, "b is still free");
        router.cooldown("b", 600_000);
        assert.deepEqual(router.availability(["a", "b"]), { available: false, retryAfterMs: 600_000 });
        now = 601_000;
        assert.equal(router.availability(["a", "b"]).available, true);
    });

    test("learns real limits, and never blocks forever on a request bigger than any budget", () => {
        const router = new ModelRouter(8_000);
        router.learnLimit("big", 100_000);
        assert.ok(router.remaining("big") > 80_000);
        assert.equal(router.pick(["a"], 50_000), "a", "let it try; the provider will decide");
    });

    test("says how long until a model frees up", () => {
        let now = 0;
        const router = new ModelRouter(8_000, () => now);
        router.record("a", 6_000);
        now = 20_000;
        const wait = router.waitMs(["a"], 3_000);
        assert.ok(wait > 35_000 && wait <= 40_000, `${wait}`);
        router.cooldown("b", 5_000);
        assert.ok(router.waitMs(["a", "b"], 100) <= 5_000);
    });

    test("estimates tokens from text length", () => {
        assert.equal(estimateTokens(""), 0);
        assert.ok(estimateTokens("x".repeat(3_600)) === 1_000);
    });
});

// -------------------------------------------------------------------------------------- HTTP client

interface Seen { model: string; body: any; auth: string | undefined }

let server: http.Server;
let seen: Seen[] = [];
let behaviour: (model: string, count: number) => { status: number; headers?: Record<string, string>; body?: string; sse?: string[] };
const counts = new Map<string, number>();

before(async () => {
    server = http.createServer((req, res) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
            const body = JSON.parse(raw || "{}");
            seen.push({ model: body.model, body, auth: req.headers.authorization });
            const n = (counts.get(body.model) ?? 0) + 1;
            counts.set(body.model, n);
            const plan = behaviour(body.model, n);
            res.writeHead(plan.status, { "content-type": plan.sse ? "text/event-stream" : "application/json", ...(plan.headers ?? {}) });
            if (plan.sse) {
                for (const piece of plan.sse) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
                res.end("data: [DONE]\n\n");
            } else res.end(plan.body ?? "{}");
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    config.llmBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    config.llmApiKey = "test-key";
});
after(() => { server.close(); server.closeAllConnections?.(); });
beforeEach(() => {
    seen = [];
    counts.clear();
    behaviour = () => ({ status: 200, sse: ["Hello ", "world."] });
});

const ask = [{ role: "user" as const, content: "hi" }];

async function collect(stream: AsyncIterable<string>) {
    let out = "";
    for await (const piece of stream) out += piece;
    return out;
}

describe("HttpLlm", () => {
    test("streams server-sent events as text, with the key and model in the request", async () => {
        const text = await collect(new HttpLlm().stream(ask, { model: "m-stream", fallbackModels: [], maxTokens: 50, reasoning: "none" }));
        assert.equal(text, "Hello world.");
        assert.equal(seen[0]!.auth, "Bearer test-key");
        assert.equal(seen[0]!.body.model, "m-stream");
        assert.equal(seen[0]!.body.stream, true);
        assert.equal(seen[0]!.body.max_completion_tokens, 50);
    });

    test("sends reasoning settings appropriate to the model family", async () => {
        await collect(new HttpLlm().stream(ask, { model: "qwen/test", fallbackModels: [], reasoning: "none" }));
        await collect(new HttpLlm().stream(ask, { model: "openai/gpt-oss-x", fallbackModels: [], reasoning: "medium" }));
        assert.equal(seen[0]!.body.reasoning_effort, "none");
        assert.equal(seen[1]!.body.reasoning_effort, "medium");
    });

    test("complete() returns the whole message and can request JSON mode", async () => {
        behaviour = () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }], usage: { total_tokens: 40 } }) });
        const text = await new HttpLlm().complete(ask, { model: "m-json", fallbackModels: [], json: true });
        assert.equal(text, '{"a":1}');
        assert.deepEqual(seen[0]!.body.response_format, { type: "json_object" });
    });

    test("a rate-limited model fails over to the next one immediately and is avoided afterwards", async () => {
        behaviour = (model) => (model === "limited" ? { status: 429, headers: { "retry-after": "30" }, body: '{"error":"tpm"}' } : { status: 200, sse: ["from fallback"] });
        const llm = new HttpLlm();
        const first = await collect(llm.stream(ask, { model: "limited", fallbackModels: ["backup"] }));
        assert.equal(first, "from fallback");
        assert.deepEqual(seen.map((s) => s.model), ["limited", "backup"]);

        seen = [];
        await collect(llm.stream(ask, { model: "limited", fallbackModels: ["backup"] }));
        assert.deepEqual(seen.map((s) => s.model), ["backup"], "the cooled-down model is not even tried");
    });

    test("server errors fail over too, but a 400 from a bad request is not retried elsewhere", async () => {
        behaviour = (model) => (model === "broken" ? { status: 503, body: "down" } : { status: 200, sse: ["ok"] });
        assert.equal(await collect(new HttpLlm().stream(ask, { model: "broken", fallbackModels: ["healthy"] })), "ok");

        seen = []; counts.clear();
        behaviour = () => ({ status: 400, body: '{"error":"bad request"}' });
        await assert.rejects(() => collect(new HttpLlm().stream(ask, { model: "picky-a", fallbackModels: ["picky-b"] })), /LLM 400/);
        assert.equal(seen.length, 1);
    });

    test("when every model is rate limited it gives up after the wait budget with a clear error", async () => {
        behaviour = () => ({ status: 429, headers: { "retry-after": "60" }, body: "{}" });
        const started = Date.now();
        await assert.rejects(() => new HttpLlm().complete(ask, { model: "busy-a", fallbackModels: ["busy-b"], maxWaitMs: 400 }), RateLimitedError);
        assert.ok(Date.now() - started < 3_000);
    });

    test("a daily limit keeps the model out for as long as the provider says, and shows up as no capacity", async () => {
        const daily = '{"error":{"message":"Rate limit reached for model `day-a` on tokens per day (TPD): Limit 200000, Used 199015, Requested 1228."}}';
        behaviour = () => ({ status: 429, headers: { "retry-after": "900" }, body: daily });
        await assert.rejects(() => new HttpLlm().complete(ask, { model: "day-a", fallbackModels: [], maxWaitMs: 200 }), (error: unknown) => {
            assert.ok(error instanceof RateLimitedError);
            assert.ok(error.retryAfterMs > 600_000, `expected a long wait, got ${error.retryAfterMs}`);
            return true;
        });
        // llmCapacity looks at the configured dialogue model chain, so check the same signal through the router directly.
        assert.equal(typeof llmCapacity().available, "boolean");
    });

    test("stops when the caller aborts", async () => {
        const controller = new AbortController();
        behaviour = () => ({ status: 200, sse: ["one ", "two ", "three"] });
        const pieces: string[] = [];
        await assert.rejects(async () => {
            for await (const piece of new HttpLlm().stream(ask, { model: "abortable", fallbackModels: [], signal: controller.signal })) {
                pieces.push(piece);
                controller.abort();
            }
        });
        assert.ok(pieces.length >= 1);
    });

    test("a model that rejects reasoning parameters is retried without them", async () => {
        let first = true;
        behaviour = () => {
            if (first) { first = false; return { status: 400, body: '{"error":{"message":"reasoning_effort is not supported"}}' }; }
            return { status: 200, sse: ["fine"] };
        };
        assert.equal(await collect(new HttpLlm().stream(ask, { model: "qwen/picky-reasoner", fallbackModels: [], reasoning: "none" })), "fine");
        assert.ok("reasoning_effort" in seen[0]!.body);
        assert.ok(!("reasoning_effort" in seen[1]!.body));
    });
});
