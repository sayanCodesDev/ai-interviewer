import "../testing/setup";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { setLlmForTesting, type ChatMessage } from "../llm/client";
import { fallbackAnalysis } from "../interview/jdAnalysis";
import { buildPlan } from "../interview/planBuilder";
import { JS_SOLUTIONS } from "../interview/problems/verify/jsSolutions";
import { FakeLlm } from "../testing/fakeLlm";
import { resetDatabase } from "../testing/db";
import { LiveInterview, approximateSpoken } from "./live";
import type { VoiceFactory, VoiceHandlers, VoiceLike } from "./voice";

/** A stand-in for the audio stack: records what would be spoken and lets tests speak as the candidate. */
class FakeVoice implements VoiceLike {
    events: any[] = [];
    spoken: string[] = [];
    stops = 0;
    ducks: boolean[] = [];
    queued = 0;
    candidateSpeaking = false;
    isClosed = false;
    handlers!: VoiceHandlers;

    async beginSpeech() {}
    speak(sentence: string) { this.spoken.push(sentence); this.queued = 2_000; }
    endSpeech() {}
    stopSpeech() { this.stops++; this.queued = 0; }
    duck(active: boolean) { this.ducks.push(active); }
    onFirstAudio(listener: () => void) { listener(); }
    get queuedMs() { return this.queued; }
    playedFraction() { return 0.5; }
    async drained() { this.queued = 0; }
    send(event: object) { this.events.push(event); return true; }
    close() { if (this.isClosed) return; this.isClosed = true; this.handlers.onClosed("closed"); }
    of(type: string) { return this.events.filter((e) => e.type === type); }
}

const last = (messages: ChatMessage[]) => messages[messages.length - 1]!.content;

/** A scripted interviewer that behaves as the step tells it to. */
function brain(overrides: (directive: string) => string | null = () => null) {
    return (call: { messages: ChatMessage[] }) => {
        const directive = last(call.messages);
        const custom = overrides(directive);
        if (custom !== null) return custom;
        if (/Open the interview/.test(directive)) return "Hello Sam, welcome to your backend interview. Could you introduce yourself?";
        if (/Coding problem \d of \d:/.test(directive)) return "Here is your first problem. The editor is open, so talk me through your approach.";
        if (/AUTHORITATIVE TEST RESULTS/.test(directive)) return "That passed all the tests, nicely done.";
        if (/Follow-up on the problem/.test(directive)) return "What is the time complexity of your solution?";
        if (/Close the interview/.test(directive)) return "Thanks Sam, that was a pleasure. [[END]]";
        if (/CURRENT STEP: The call dropped/.test(directive)) return "Welcome back, let's continue.";
        if (/Follow-up turns used so far: \d of \d/.test(directive) || /Exchanges so far/.test(directive)) {
            return /may not ask any more follow-ups|That is enough questions/.test(directive) ? "Thanks, that covers it. [[ADVANCE]]" : "Interesting, tell me more about that.";
        }
        return "Okay.";
    };
}

let userId: string;

before(async () => { await resetDatabase(); });
after(async () => { await prisma.$disconnect(); });

beforeEach(async () => {
    await resetDatabase();
    const user = await prisma.user.create({ data: { email: "sam@example.com", password: "x", name: "Sam Rivera" } });
    userId = user.id;
});
afterEach(() => setLlmForTesting(null));

async function setup(format: "quick" | "standard" = "quick", options: { llm?: FakeLlm; reconnectWindowMs?: number } = {}) {
    const role = "Backend Engineer";
    const level = "mid" as const;
    const created = await prisma.interview.create({
        data: { userId, targetRole: role, level, format, durationMinutes: 20, planStatus: "READY" },
    });
    const plan = buildPlan({ role, level, format, analysis: fallbackAnalysis({ role, level }), seed: created.id });
    setLlmForTesting(options.llm ?? new FakeLlm(brain()));

    const voices: FakeVoice[] = [];
    const finished: Array<{ id: string; substantive: boolean; reason: string }> = [];
    const factory: VoiceFactory = async (_offer, _params, handlers) => {
        const voice = new FakeVoice();
        voice.handlers = handlers;
        voices.push(voice);
        return { voice, answer: { sdp: "v=0 answer", type: "answer" } };
    };
    const live = new LiveInterview({
        interview: { ...created, jobDescription: null, resumeText: null },
        plan,
        candidateName: "Sam",
        voiceFactory: factory,
        reconnectWindowMs: options.reconnectWindowMs,
        onFinished: (id, info) => finished.push({ id, ...info }),
    });
    const connect = async () => {
        await live.connect({ sdp: "v=0 offer that is long enough", type: "offer" });
        const voice = voices[voices.length - 1]!;
        voice.handlers.onChannelOpen();
        await live.idle();
        return voice;
    };
    const say = async (voice: FakeVoice, text: string) => {
        voice.handlers.onCandidateTurn(text);
        await live.idle();
    };
    return { live, created, plan, connect, say, voices, finished };
}

const ANSWER = "Here is a thorough spoken answer with a concrete example from my last project.";

describe("LiveInterview", () => {
    test("the interviewer speaks first, and the interview starts on the server", async () => {
        const { connect, created } = await setup();
        const voice = await connect();

        assert.match(voice.spoken.join(" "), /Hello Sam, welcome/);
        assert.equal(voice.of("ROUND")[0].roundType, "intro");
        assert.deepEqual(voice.of("STATE").map((e) => e.state).slice(0, 2), ["thinking", "speaking"]);
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "IN_PROGRESS");
        assert.ok(row.startedAt);
    });

    test("a candidate turn gets captions both ways and moves the interview along", async () => {
        const { connect, say, live } = await setup();
        const voice = await connect();
        await say(voice, ANSWER);

        const captions = voice.of("CAPTION");
        assert.ok(captions.some((c) => c.role === "candidate" && c.final && c.text === ANSWER));
        assert.ok(captions.some((c) => c.role === "interviewer" && c.final));
        await say(voice, ANSWER);
        await say(voice, ANSWER);
        assert.ok(voice.of("ROUND").length >= 2, "reached the next part");
        void live;
    });

    test("interim captions are throttled and a final one always follows", async () => {
        const { connect } = await setup();
        const voice = await connect();
        for (const partial of ["I", "I would", "I would use", "I would use a"]) voice.handlers.onCandidateSpeaking(partial, false);
        voice.handlers.onCandidateSpeaking("I would use a hash map.", true);
        const candidate = voice.of("CAPTION").filter((c) => c.role === "candidate");
        assert.ok(candidate.length >= 1 && candidate.length <= 5);
        assert.equal(candidate[candidate.length - 1].text, "I would use a hash map.");
    });
});

describe("LiveInterview: interruptions", () => {
    test("real speech cuts the interviewer off mid-reply and the cut-off reply is recorded as interrupted", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        // A model that says one sentence and then pauses, like a slow generation.
        const slow = {
            async *stream(_m: ChatMessage[], options: { signal?: AbortSignal } = {}) {
                yield "Hello Sam, welcome to the interview. ";
                await gate;
                if (options.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
                yield "Could you please introduce yourself?";
            },
            async complete() { return ""; },
        };
        const ctx = await setup("quick", { llm: slow as never });
        await ctx.live.connect({ sdp: "v=0 offer that is long enough", type: "offer" });
        const voice = ctx.voices[0]!;
        voice.handlers.onChannelOpen();
        for (let i = 0; i < 100 && voice.spoken.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
        assert.equal(voice.spoken.length, 1, "the first sentence is spoken while the rest is still being generated");

        voice.handlers.onCandidateSpeaking("yeah", false);
        assert.equal(voice.stops, 0, "a backchannel must not interrupt");

        voice.handlers.onCandidateSpeaking("wait, can I ask something first", false);
        assert.ok(voice.stops >= 1, "real speech interrupts");
        release();
        await ctx.live.idle();

        await ctx.live.finalize("candidate_ended");
        const turns = (await prisma.interviewTurn.findMany({ where: { interviewId: ctx.created.id }, orderBy: { seq: "asc" } })).filter((t) => t.role !== "SYSTEM");
        assert.equal(turns[0]!.role, "INTERVIEWER");
        assert.equal(turns[0]!.interrupted, true);
        assert.ok(!turns[0]!.text.includes("introduce yourself"), "words never spoken are not in the transcript");
    });

    test("a word or two only dips the interviewer's voice; a few words, or a finished utterance, stop it", async () => {
        const ctx = await setup("quick");
        const voice = await ctx.connect();
        voice.queued = 3_000;
        voice.ducks.length = 0; // (opening the call restores the volume once)

        voice.handlers.onCandidateSpeaking("Hi, I'm", false); // could be a stray noise or a trace of echo
        assert.equal(voice.stops, 0, "not stopped by two words");
        assert.deepEqual(voice.ducks, [true], "but turned down at once");

        voice.handlers.onCandidateSpeaking("wait can I ask something", false);
        assert.ok(voice.stops >= 1, "stopped once it is clear the candidate is talking");
        assert.equal(voice.ducks[voice.ducks.length - 1], false, "and the volume is restored for the next reply");

        const finished = await setup("quick");
        const other = await finished.connect();
        other.queued = 3_000;
        other.handlers.onCandidateSpeaking("hold on", true);
        assert.ok(other.stops >= 1, "a finished utterance of any real length stops it");
    });

    test("the interviewer's own voice heard through the microphone neither interrupts it nor becomes the candidate's answer", async () => {
        const ctx = await setup("quick");
        const voice = await ctx.connect();
        const spokenSoFar = voice.spoken.join(" ");
        assert.ok(spokenSoFar.length > 20, "the interviewer has said something");
        voice.queued = 3_000;
        voice.ducks.length = 0;

        // The recogniser hears the interviewer through the speakers, misspelling a word here and there.
        const echoed = spokenSoFar.split(" ").slice(0, 8).join(" ").replace(/Sam/, "Sal");
        voice.handlers.onCandidateSpeaking(echoed, false);
        voice.handlers.onCandidateSpeaking(echoed, true);
        voice.handlers.onCandidateTurn(echoed);
        await ctx.live.idle();

        assert.equal(voice.stops, 0, "not interrupted by its own echo");
        assert.deepEqual(voice.ducks, [], "not even turned down");
        assert.equal(voice.of("CAPTION").filter((c) => c.role === "candidate").length, 0, "no caption for the echo");
        const said = (await prisma.interviewTurn.findMany({ where: { interviewId: ctx.created.id, role: "CANDIDATE" } })).length;
        assert.equal(said, 0, "the echo was not recorded as an answer");
    });

    test("the interview does not advance past an interrupted question", async () => {
        const ctx = await setup("quick");
        const voice = await ctx.connect();
        const rounds = voice.of("ROUND").length;
        voice.queued = 3_000;
        voice.handlers.onCandidateSpeaking("hold on a second please", false);
        await ctx.live.idle();
        assert.equal(voice.of("ROUND").length, rounds);
    });
});

describe("LiveInterview: coding", () => {
    async function toCoding() {
        const ctx = await setup("quick");
        const voice = await ctx.connect();
        for (let i = 0; i < 8 && voice.of("SHOW_CODE_EDITOR").length === 0; i++) await ctx.say(voice, ANSWER);
        assert.equal(voice.of("SHOW_CODE_EDITOR").length, 1, "the coding problem opened");
        return { ...ctx, voice };
    }

    test("a submission is graded in the sandbox, redacted for the browser, saved, and reviewed aloud", async () => {
        const { voice, live, created } = await toCoding();
        const shown = voice.of("SHOW_CODE_EDITOR")[0];
        const key = shown.problem.key as string;
        assert.equal(shown.mode, "code");
        assert.ok(!JSON.stringify(shown).includes("hidden"));

        voice.handlers.onClientMessage(JSON.stringify({ type: "SUBMIT_CODE", problemKey: key, language: "javascript", code: JS_SOLUTIONS[key] }));
        await live.idle();

        const result = voice.of("SUBMISSION_RESULT")[0];
        assert.equal(result.run.status, "PASSED");
        assert.ok(result.run.cases.filter((c: any) => c.hidden).every((c: any) => c.expected === undefined && c.actual === undefined));
        assert.match(voice.spoken.join(" "), /passed all the tests/);

        const rows = await prisma.codeSubmission.findMany({ where: { interviewId: created.id } });
        assert.equal(rows.length, 1);
        assert.equal(rows[0]!.kind, "SUBMIT");
        assert.equal(rows[0]!.passed, rows[0]!.total);
    });

    test("a wrong submission is graded honestly and the interviewer is told the truth", async () => {
        const seen: string[] = [];
        const llm = new FakeLlm(brain((d) => { if (/AUTHORITATIVE TEST RESULTS/.test(d)) seen.push(d); return null; }));
        const ctx = await setup("quick", { llm });
        const voice = await ctx.connect();
        for (let i = 0; i < 8 && voice.of("SHOW_CODE_EDITOR").length === 0; i++) await ctx.say(voice, ANSWER);
        const key = voice.of("SHOW_CODE_EDITOR")[0].problem.key as string;

        voice.handlers.onClientMessage(JSON.stringify({ type: "SUBMIT_CODE", problemKey: key, language: "javascript", code: "function nothing() {}" }));
        await ctx.live.idle();
        assert.notEqual(voice.of("SUBMISSION_RESULT")[0].run.status, "PASSED");
        assert.match(seen[0]!, /did not pass everything yet|did not compile|crashed|Failing/);
        assert.equal(voice.of("HIDE_CODE_EDITOR").length, 0, "the editor stays open for a retry");
    });

    test("a submission for a problem that is not open is refused with a notice", async () => {
        const { voice, live } = await toCoding();
        voice.handlers.onClientMessage(JSON.stringify({ type: "SUBMIT_CODE", problemKey: "two-sum-nope", language: "javascript", code: "x" }));
        await live.idle();
        assert.equal(voice.of("SUBMISSION_RESULT").length, 0);
        assert.equal(voice.of("NOTICE").pop().level, "warning");
    });
});

describe("LiveInterview: hostile and broken input", () => {
    test("malformed, unknown and oversized data-channel messages are ignored", async () => {
        const { connect, live } = await setup();
        const voice = await connect();
        const before = voice.events.length;
        for (const raw of ["not json", "{}", JSON.stringify({ type: "DROP_TABLE" }), JSON.stringify({ type: "SUBMIT_CODE", problemKey: "x", language: "cobol", code: "x" }), JSON.stringify({ type: "SUBMIT_CODE", problemKey: "x", language: "python", code: "x".repeat(200_000) }), JSON.stringify({ type: "USER_TEXT", text: "" }), JSON.stringify({ type: "USER_TEXT", text: "y".repeat(5_000) })]) {
            voice.handlers.onClientMessage(raw);
        }
        await live.idle();
        assert.equal(voice.events.length, before, "nothing happened");
    });

    test("the browser's voice-quality reports are accepted, counted and never disturb the interview", async () => {
        const { connect, live } = await setup();
        const voice = await connect();
        const before = voice.events.length;
        voice.handlers.onClientMessage(JSON.stringify({ type: "CLIENT_STATS", lossPercent: 0.4, concealedPercent: 0.2, jitterMs: 3, packets: 250 }));
        voice.handlers.onClientMessage(JSON.stringify({ type: "CLIENT_STATS", lossPercent: 12, concealedPercent: 30, jitterMs: 90, packets: 250 }));
        await live.idle();
        assert.equal(voice.events.length, before, "nothing was sent back or changed");
    });

    test("typed text works as a candidate turn", async () => {
        const { connect, live } = await setup();
        const voice = await connect();
        voice.handlers.onClientMessage(JSON.stringify({ type: "USER_TEXT", text: "I am Sam and I build backend services." }));
        await live.idle();
        assert.ok(voice.of("CAPTION").some((c) => c.role === "candidate" && c.text.includes("backend services")));
    });

    test("when the model fails the interviewer apologises and the interview does not skip ahead", async () => {
        const broken = new FakeLlm(brain());
        const good = broken.stream.bind(broken);
        let fail = false;
        broken.stream = async function* (m, o) { if (fail) throw Object.assign(new Error("boom"), { status: 500 }); yield* good(m, o); };
        const { connect, say, live } = await setup("quick", { llm: broken });
        const voice = await connect();
        const roundsBefore = voice.of("ROUND").length;
        fail = true;
        await say(voice, ANSWER);
        assert.match(voice.spoken[voice.spoken.length - 1]!, /technical hiccup/);
        assert.equal(voice.of("ROUND").length, roundsBefore);
        fail = false;
        await say(voice, ANSWER);
        assert.ok(voice.spoken.length > 2, "recovers on the next turn");
        void live;
    });
});

describe("LiveInterview: flooding", () => {
    test("a flood of data-channel messages is cut off with a warning, and the interview carries on", async () => {
        const { connect, live } = await setup();
        const voice = await connect();
        for (let i = 0; i < 60; i++) voice.handlers.onClientMessage(JSON.stringify({ type: "PING" }));
        assert.ok(voice.of("NOTICE").some((n) => n.level === "warning" && /too quickly/.test(n.message)));
        void live;
    });

    test("submissions are spaced out, so the sandbox cannot be hammered from the call", async () => {
        const ctx = await setup("quick");
        const voice = await ctx.connect();
        for (let i = 0; i < 8 && voice.of("SHOW_CODE_EDITOR").length === 0; i++) await ctx.say(voice, ANSWER);
        const key = voice.of("SHOW_CODE_EDITOR")[0].problem.key as string;
        const submit = () => voice.handlers.onClientMessage(JSON.stringify({ type: "SUBMIT_CODE", problemKey: key, language: "javascript", code: JS_SOLUTIONS[key] }));

        submit();
        await ctx.live.idle();
        submit();
        submit();
        await ctx.live.idle();
        assert.equal(voice.of("SUBMISSION_RESULT").length, 1, "only the first was graded");
        assert.ok(voice.of("NOTICE").some((n) => /moment/.test(n.message)));
    });
});

describe("LiveInterview: reconnecting and finishing", () => {
    test("a dropped call is held open, and a reconnect resumes with a welcome back", async () => {
        const { live, connect, voices, created } = await setup("quick", { reconnectWindowMs: 5_000 });
        const first = await connect();
        first.close();
        assert.equal(live.isFinalized, false);

        const second = await connect();
        assert.equal(voices.length, 2);
        assert.match(second.spoken.join(" "), /Welcome back/);
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "IN_PROGRESS");
        await live.finalize("candidate_ended");
    });

    test("if nobody reconnects the interview is closed and saved", async () => {
        const { live, connect, finished, created } = await setup("quick", { reconnectWindowMs: 120 });
        const voice = await connect();
        for (let i = 0; i < 3; i++) voice.handlers.onCandidateTurn(ANSWER), await live.idle();
        voice.close();
        await new Promise((resolve) => setTimeout(resolve, 400));
        assert.equal(live.isFinalized, true);
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "COMPLETED");
        assert.equal(row.endReason, "disconnected");
        assert.equal(row.reportStatus, "PENDING");
        assert.equal(finished[0]!.substantive, true);
    });

    test("ending early saves the whole transcript in order and asks for a report", async () => {
        const { live, connect, say, finished, created } = await setup("quick");
        const voice = await connect();
        await say(voice, "I'm Sam and I've built payment services for five years.");
        await say(voice, ANSWER);
        await say(voice, ANSWER);
        voice.handlers.onClientMessage(JSON.stringify({ type: "END_INTERVIEW" }));
        await new Promise((resolve) => setTimeout(resolve, 300));

        assert.equal(voice.of("ENDING")[0].reason, "candidate_ended");
        const turns = await prisma.interviewTurn.findMany({ where: { interviewId: created.id }, orderBy: { seq: "asc" } });
        assert.ok(turns.length >= 6);
        assert.deepEqual(turns.map((t) => t.seq), turns.map((_, i) => i), "sequence numbers are contiguous");
        assert.equal(turns[0]!.role, "SYSTEM", "the transcript opens with the first part's heading");
        assert.equal(turns[1]!.role, "INTERVIEWER");
        assert.ok(turns.some((t) => t.role === "CANDIDATE" && t.text.includes("payment services")));
        assert.ok(turns.every((t) => t.offsetMs >= 0));
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "COMPLETED");
        assert.equal(row.reportStatus, "PENDING");
        assert.ok(finished[0]!.substantive);
        void live;
    });

    test("a candidate who talks over the goodbye does not stop the interview from ending", async () => {
        let voiceRef: FakeVoice | null = null;
        const llm = new FakeLlm(brain((directive) => {
            // The moment the closing words start, the candidate says "thanks, bye" over them.
            if (/Close the interview/.test(directive)) {
                voiceRef?.handlers.onCandidateTurn("Thanks, bye!");
                return "Thanks Sam, that was a pleasure. [[END]]";
            }
            return null;
        }));
        const { live, connect, say, created } = await setup("quick", { llm });
        const voice = await connect();
        voiceRef = voice;

        for (let i = 0; i < 40 && voice.of("ENDING").length === 0; i++) {
            const shown = voice.of("SHOW_CODE_EDITOR").filter((e) => e.mode === "code");
            const key: string | undefined = shown.length > voice.of("HIDE_CODE_EDITOR").length ? shown[shown.length - 1].problem.key : undefined;
            if (key && voice.of("SUBMISSION_RESULT").filter((r) => r.problemKey === key).length === 0) {
                voice.handlers.onClientMessage(JSON.stringify({ type: "SUBMIT_CODE", problemKey: key, language: "javascript", code: JS_SOLUTIONS[key] }));
                await live.idle();
            } else {
                await say(voice, ANSWER);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await new Promise((resolve) => setTimeout(resolve, 2_500));

        assert.equal(voice.of("ENDING")[0]?.reason, "completed", "the interview ended normally");
        const turns = await prisma.interviewTurn.findMany({ where: { interviewId: created.id, role: "INTERVIEWER" }, orderBy: { seq: "asc" } });
        const goodbye = turns[turns.length - 1]!;
        assert.match(goodbye.text, /pleasure/);
        assert.equal(goodbye.interrupted, false, "the goodbye was not cut off by the candidate");
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "COMPLETED");
    });

    test("an interview with almost nothing in it is abandoned and gets no report", async () => {
        const { live, connect, finished, created } = await setup("quick");
        await connect();
        await live.finalize("candidate_ended");
        const row = await prisma.interview.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(row.status, "ABANDONED");
        assert.equal(row.reportStatus, "NONE");
        assert.equal(finished[0]!.substantive, false);
    });

    test("finalizing twice is harmless", async () => {
        const { live, connect } = await setup("quick");
        await connect();
        await Promise.all([live.finalize("candidate_ended"), live.finalize("candidate_ended")]);
        assert.equal(live.isFinalized, true);
    });
});

describe("approximateSpoken", () => {
    test("keeps the sentences the candidate had probably heard", () => {
        const sentences = ["First sentence is here.", "Second sentence is here.", "Third sentence is here."];
        assert.equal(approximateSpoken(sentences, 0), "");
        assert.equal(approximateSpoken(sentences, 0.3), "First sentence is here.");
        assert.equal(approximateSpoken(sentences, 0.6), "First sentence is here. Second sentence is here.");
        assert.equal(approximateSpoken(sentences, 1), sentences.join(" "));
        assert.equal(approximateSpoken([], 0.5), "");
    });
});
