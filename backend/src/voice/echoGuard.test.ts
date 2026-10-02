import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EchoGuard } from "./echoGuard";

const GREETING = "Hi Sam, I'm Thalia, your interviewer for the Backend Engineer role. We'll chat about your background and then work through a coding problem.";

function guard() {
    let now = 0;
    const echo = new EchoGuard(() => now);
    return { echo, advance: (ms: number) => { now += ms; }, now: () => now };
}

const NUDGE = "No rush. Want me to rephrase the question or give you more time?";

describe("EchoGuard", () => {
    test("recognises the interviewer's own words coming back through the microphone", () => {
        const { echo } = guard();
        echo.noteSpoken(GREETING);
        assert.equal(echo.isEcho("Hi Sam I'm Thalia your interviewer for the backend engineer role"), true);
        assert.equal(echo.isEcho("we'll chat about your background and then work through a coding problem"), true);
    });

    test("tolerates the recogniser's respellings and small gaps", () => {
        const { echo } = guard();
        echo.noteSpoken(GREETING);
        assert.equal(echo.isEcho("Hi Sam I'm Talia your interviewer for the back end engineer role we'll chat about your background"), true);
    });

    test("misspellings of the same words do not hide an echo", () => {
        const { echo } = guard();
        echo.noteSpoken("Hi, I'm Thalia, and I'll be your interviewer today. We'll talk about your background.");
        assert.equal(echo.isEcho("Hi I'm Telia and I'll be your interview"), true, "Thalia/Telia, interviewer/interview");
        assert.equal(echo.isEcho("hi i'm talia and i'll be your interviewer today we'll talk about your back ground"), true);
        assert.equal(echo.isEcho("Hi I'm Sam and I'm excited to be here today"), false, "a person answering, not the same sentence");
    });

    test("one badly misheard word does not hide an echo, but a run of different words is not echo", () => {
        const { echo } = guard();
        echo.noteSpoken("Hi, I'm Thalia, and I'll be your interviewer today. We'll talk about your background.");
        assert.equal(echo.isEcho("Hi. I'm Sally. I'll be your"), true, "one word in five differs");
        assert.equal(echo.isEcho("Hi. I'm Sally. I'll take"), false, "two of five differ");
        assert.equal(echo.isEcho("Okay let me think about the interviewer today"), false);
    });

    test("a real answer is never mistaken for echo, even when it shares a few words", () => {
        const { echo } = guard();
        echo.noteSpoken("Tell me about a recent project you're proud of, and what your part in it was.");
        assert.equal(echo.isEcho("I built an idempotent payments API for card transactions at my last company"), false);
        assert.equal(echo.isEcho("Sure, a recent project I'm proud of was migrating our billing service"), false);
        assert.equal(echo.isEcho("my part in it was the write path"), false);
    });

    test("one or two words are never judged", () => {
        const { echo } = guard();
        echo.noteSpoken("Could you say a bit more about that?");
        assert.equal(echo.isEcho("a bit"), false);
        assert.equal(echo.isEcho("yes"), false);
    });

    test("for the first words of speech that has only just begun, an exact repeat of two words is judged too", () => {
        const { echo } = guard();
        echo.noteSpoken(GREETING);
        assert.equal(echo.isEcho("Ready to", 2), false, "nothing like that was said");
        assert.equal(echo.isEcho("Hi Sam", 2), true, "the first two words of the greeting");
        assert.equal(echo.isEcho("Hi Sam", 3), false, "answers are still only judged from three words");
        assert.equal(echo.isEcho("yes", 2), false, "one word never");
    });

    test("the first words of an echo are caught as they arrive, before the interviewer is cut off by them", () => {
        const { echo } = guard();
        echo.noteSpoken(GREETING);
        assert.equal(echo.isEcho("Hi Sam I'm"), true);
        assert.equal(echo.isEcho("Hi Sam I'm Thalia your interviewer"), true);
        assert.equal(echo.isEcho("Hi Sam I'm Thalia your interviewer for the backend"), true);
    });

    test("a few words that are not a run from what was just said are not echo", () => {
        const { echo } = guard();
        echo.noteSpoken(GREETING);
        assert.equal(echo.isEcho("Hi there, thanks for having me"), false);
        assert.equal(echo.isEcho("I'm Sam"), false);
    });

    test("only recent speech counts", () => {
        const { echo, advance } = guard();
        echo.noteSpoken(GREETING);
        advance(40_000);
        assert.equal(echo.isEcho("Hi Sam I'm Thalia your interviewer for the backend engineer role"), false, "long after, the same words are a person repeating them");
    });

    test("with nothing said yet, nothing is echo", () => {
        assert.equal(guard().echo.isEcho("Hi Sam I'm Thalia your interviewer for the backend engineer role"), false);
    });

    test("a candidate reading the question back with an answer attached is kept", () => {
        const { echo } = guard();
        echo.noteSpoken("What is the time and space complexity of your solution, and why?");
        assert.equal(echo.isEcho("The time and space complexity is O of n because we visit each element once and store counts in a map"), false);
    });

    // From a real interview: the check-in above was asked again every half minute for seven minutes, because every answer to it
    // ("give me more time", "rephrase the question") was taken for the interviewer's own voice and thrown away.
    test("speech that began after the interviewer stopped is the candidate, even in the interviewer's own words", () => {
        const { echo, advance, now } = guard();
        echo.noteSpoken(NUDGE);
        advance(4_000);
        echo.noteStopped();
        advance(1_500);
        for (const answer of ["Give me more time.", "Rephrase the question.", "Yes, rephrase the question.", "Please rephrase the question."]) {
            assert.equal(echo.isEcho(answer, 3, now()), false, answer);
            assert.equal(echo.isEcho(answer, 2, now()), false, `${answer} (as it starts)`);
        }
    });

    test("echo is still caught while the interviewer speaks, and for its last words just after", () => {
        const { echo, advance, now } = guard();
        echo.noteSpoken(NUDGE);
        advance(2_000);
        const duringSpeech = now();
        assert.equal(echo.isEcho("rephrase the question or give you more time", 3, duringSpeech), true, "heard while speaking");
        advance(2_000);
        echo.noteStopped();
        advance(1_200);
        assert.equal(echo.isEcho("rephrase the question or give you more time", 3, duringSpeech), true, "began while speaking, finished recognising after");
        assert.equal(echo.isEcho("give you more time", 3, now() - 900), true, "the last words, a moment after the audio stopped");
    });

    test("speaking again makes echo possible again", () => {
        const { echo, advance, now } = guard();
        echo.noteSpoken(NUDGE);
        echo.noteStopped();
        advance(5_000);
        echo.noteSpoken("Could you walk me through your approach?");
        assert.equal(echo.isEcho("could you walk me through", 3, now()), true);
    });

    test("three words must match exactly: one different word in three is a person", () => {
        const { echo } = guard();
        echo.noteSpoken(NUDGE);
        assert.equal(echo.isEcho("More time, please."), false);
        assert.equal(echo.isEcho("rephrase the question"), true, "an exact run is still echo while the interviewer speaks");
    });
});
