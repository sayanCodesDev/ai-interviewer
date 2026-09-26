import "../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { streamReply } from "../interview/dialogue";
import { FakeLlm } from "../testing/fakeLlm";
import { reasoningParams, setLlmForTesting } from "./client";
import { StructuredOutputError, completeJson, extractJson } from "./json";

describe("reasoning parameters", () => {
    test("are chosen per model family", () => {
        assert.deepEqual(reasoningParams("qwen/qwen3.8-27b", "none"), { reasoning_effort: "none" });
        assert.deepEqual(reasoningParams("qwen/qwen3.8-27b", "high"), { reasoning_effort: "default" });
        assert.deepEqual(reasoningParams("openai/gpt-oss-120b", "none"), { reasoning_effort: "low" });
        assert.deepEqual(reasoningParams("openai/gpt-oss-120b", "high"), { reasoning_effort: "high" });
        assert.deepEqual(reasoningParams("some/other-model", "high"), {});
    });
});

describe("extractJson", () => {
    test("handles fences, prose and reasoning around the object", () => {
        assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
        assert.deepEqual(extractJson('Here you go: {"a": {"b": [1, 2]}} hope that helps'), { a: { b: [1, 2] } });
        assert.deepEqual(extractJson('<think>hmm {not json}</think>{"ok": true}'), { ok: true });
        assert.throws(() => extractJson("no object here"));
    });
});

describe("completeJson", () => {
    const schema = z.object({ score: z.number().min(0).max(10), note: z.string() });

    test("returns a valid reply as is", async () => {
        const llm = new FakeLlm().enqueue('{"score": 7, "note": "fine"}');
        setLlmForTesting(llm);
        assert.deepEqual(await completeJson([{ role: "user", content: "grade" }], schema), { score: 7, note: "fine" });
        assert.equal(llm.calls.length, 1);
        assert.equal(llm.calls[0]!.options.json, true);
    });

    test("shows the model what was wrong and accepts the correction", async () => {
        const llm = new FakeLlm().enqueue('{"score": 42, "note": "fine"}', '{"score": 9, "note": "fine"}');
        setLlmForTesting(llm);
        const result = await completeJson([{ role: "user", content: "grade" }], schema);
        assert.equal(result.score, 9);
        const retry = llm.calls[1]!.messages;
        assert.match(retry[retry.length - 1]!.content, /score/);
        assert.equal(retry[retry.length - 2]!.role, "assistant");
    });

    test("gives up with a clear error after one correction", async () => {
        const llm = new FakeLlm("not json at all");
        setLlmForTesting(llm);
        await assert.rejects(() => completeJson([{ role: "user", content: "grade" }], schema), StructuredOutputError);
        assert.equal(llm.calls.length, 2);
        setLlmForTesting(null);
    });
});

describe("streamReply", () => {
    test("emits sentences early and lifts out markers and reasoning", async () => {
        const llm = new FakeLlm("<think>plan the reply</think>Good answer. Let's move on. [[ADVANCE]]", 3);
        const sentences: string[] = [];
        const result = await streamReply(llm, [{ role: "user", content: "x" }], { onSentence: (s) => sentences.push(s) });
        assert.deepEqual(sentences, ["Good answer.", "Let's move on."]);
        assert.deepEqual(result.markers, ["ADVANCE"]);
        assert.equal(result.text, "Good answer. Let's move on.");
        assert.equal(result.interrupted, false);
        assert.ok(result.firstSentenceMs !== null);
    });

    test("strips markdown from what is spoken", async () => {
        const llm = new FakeLlm("**Nice** work with `map`. Next.");
        const result = await streamReply(llm, [{ role: "user", content: "x" }]);
        assert.equal(result.text, "Nice work with map. Next.");
    });

    test("an abort mid-reply reports what was already spoken and ignores markers", async () => {
        const controller = new AbortController();
        const llm = new FakeLlm("First sentence here. Second sentence here. [[ADVANCE]]", 5);
        const sentences: string[] = [];
        const result = await streamReply(llm, [{ role: "user", content: "x" }], {
            signal: controller.signal,
            onSentence: (s) => {
                sentences.push(s);
                controller.abort();
            },
        });
        assert.equal(result.interrupted, true);
        assert.deepEqual(result.markers, []);
        assert.deepEqual(sentences, ["First sentence here."]);
    });

    test("model errors other than aborts propagate", async () => {
        const llm = {
            async *stream() { throw Object.assign(new Error("rate limited"), { status: 429 }); },
            async complete() { return ""; },
        };
        await assert.rejects(() => streamReply(llm, [{ role: "user", content: "x" }]), /rate limited/);
    });
});
