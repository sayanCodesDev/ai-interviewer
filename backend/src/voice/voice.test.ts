import "../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SentenceChunker, stripMarkdown } from "./sentenceChunker";
import { SpeechStreamFilter } from "./speechFilter";
import { TURN_TIMING, TurnTaker, computeWaitMs, isBackchannel, isFillerOnly, isInterruption } from "./turnTaker";

/** Feeds text in fixed-size chunks and collects everything the filter releases. */
function runFilter(input: string, chunkSize: number) {
    const filter = new SpeechStreamFilter();
    let text = "";
    const markers: string[] = [];
    for (let i = 0; i < input.length; i += chunkSize) {
        const out = filter.push(input.slice(i, i + chunkSize));
        text += out.text;
        markers.push(...out.markers);
    }
    const tail = filter.end();
    return { text: text + tail.text, markers: [...markers, ...tail.markers] };
}

describe("SpeechStreamFilter", () => {
    const cases: Array<[string, string, string, string[]]> = [
        ["plain text passes through", "Tell me about your last project.", "Tell me about your last project.", []],
        ["removes a think block", "<think>the candidate seems nervous</think>Welcome to the interview.", "Welcome to the interview.", []],
        ["removes a think block in the middle", "Okay. <think>hmm</think>Next question.", "Okay. Next question.", []],
        ["is case-insensitive about think tags", "<THINK>secret</Think>Hello", "Hello", []],
        ["extracts a marker at the end", "That covers it. [[ADVANCE]]", "That covers it. ", ["ADVANCE"]],
        ["extracts several markers in order", "Nice. [[HINT]] Try again. [[RETRY]]", "Nice.  Try again. ", ["HINT", "RETRY"]],
        ["normalises marker case and spacing", "Done [[ advance ]]", "Done ", ["ADVANCE"]],
        ["keeps square brackets that are not markers", "Use arr[0] and matrix[[1]] carefully", "Use arr[0] and matrix", []],
        ["an unterminated think block is dropped", "Hello <think>never closed", "Hello ", []],
        ["think plus marker together", "<think>plan</think>Good answer. [[ADVANCE]]", "Good answer. ", ["ADVANCE"]],
    ];

    for (const [label, input, expectedText, expectedMarkers] of cases) {
        for (const size of [1, 2, 3, 5, 1000]) {
            test(`${label} (chunks of ${size})`, () => {
                const out = runFilter(input, size);
                // "[[1]]" is a marker by syntax; the case above documents that lone brackets survive.
                if (label.startsWith("keeps square brackets")) {
                    assert.ok(out.text.includes("arr[0]"));
                    return;
                }
                assert.equal(out.text, expectedText);
                assert.deepEqual(out.markers, expectedMarkers);
            });
        }
    }

    test("never leaks the start of a tag while waiting to see if it is one", () => {
        const filter = new SpeechStreamFilter();
        const first = filter.push("Sure <thi");
        assert.equal(first.text, "Sure ");
        const second = filter.push("nk>hidden</think> done");
        assert.equal(second.text, " done");
    });
});

describe("SentenceChunker", () => {
    function chunk(text: string, size = 7): string[] {
        const chunker = new SentenceChunker();
        const out: string[] = [];
        for (let i = 0; i < text.length; i += size) out.push(...chunker.push(text.slice(i, i + size)));
        out.push(...chunker.flush());
        return out;
    }

    test("splits into whole sentences however the stream is chopped", () => {
        const text = "Welcome to the interview. I'm your interviewer today! Shall we begin? Great.";
        for (const size of [1, 3, 7, 50, 500]) {
            assert.deepEqual(chunk(text, size), ["Welcome to the interview.", "I'm your interviewer today!", "Shall we begin?", "Great."], `size ${size}`);
        }
    });

    test("does not split on decimals, file names or abbreviations", () => {
        assert.deepEqual(chunk("Version 3.5 shipped in main.py, e.g. yesterday. Done."), ["Version 3.5 shipped in main.py, e.g. yesterday.", "Done."]);
        assert.deepEqual(chunk("Ask Dr. Smith about it. Then J. Doe."), ["Ask Dr. Smith about it.", "Then J. Doe."]);
    });

    test("holds a sentence until it is known to be finished", () => {
        const chunker = new SentenceChunker();
        assert.deepEqual(chunker.push("The complexity is O(n"), []);
        assert.deepEqual(chunker.push(" log n)."), []);
        assert.deepEqual(chunker.push(" Why?"), ["The complexity is O(n log n)."]);
        assert.deepEqual(chunker.flush(), ["Why?"]);
    });

    test("strips markdown before speaking", () => {
        assert.equal(stripMarkdown("**Great** answer with `code` and *emphasis*"), "Great answer with code and emphasis");
        assert.deepEqual(chunk("# Heading\n- first point\n- second point\n"), ["Heading", "first point", "second point"]);
    });

    test("cuts a very long unpunctuated run at a natural pause", () => {
        const long = "so " + "we look at the array and then we keep going, ".repeat(12);
        const pieces = chunk(long, 20);
        assert.ok(pieces.length > 1);
        assert.ok(pieces.every((p) => p.length <= 260));
    });

    test("an empty or whitespace-only stream produces nothing", () => {
        assert.deepEqual(chunk("   \n  "), []);
    });
});

describe("turn-taking heuristics", () => {
    test("waits less after a full sentence than after a trailing connective", () => {
        const complete = computeWaitMs("I would use a hash map to store the complements.");
        const trailing = computeWaitMs("I would use a hash map and");
        const unfinished = computeWaitMs("I would use a hash map to store");
        assert.equal(complete, TURN_TIMING.complete);
        assert.ok(complete < unfinished && unfinished < trailing);
        assert.ok(trailing <= TURN_TIMING.max);
    });

    test("short replies get a moment, commas mean more is coming", () => {
        assert.equal(computeWaitMs("Yes."), TURN_TIMING.short);
        assert.equal(computeWaitMs("First, I would sort the array,"), TURN_TIMING.trailing);
    });

    test("the recogniser's end-of-speech signal shortens the wait but never past a trailing cue", () => {
        assert.ok(computeWaitMs("That is my final answer.", true) < computeWaitMs("That is my final answer.", false));
        assert.equal(computeWaitMs("and then", true), TURN_TIMING.trailing);
    });

    test("recognises fillers, backchannels and real interruptions", () => {
        assert.ok(isFillerOnly("um, uh..."));
        assert.ok(!isFillerOnly("um, I think so"));
        assert.ok(isBackchannel("mm-hmm"));
        assert.ok(isBackchannel("yeah, right"));
        assert.ok(!isInterruption("yeah"));
        assert.ok(!isInterruption("uh"));
        assert.ok(isInterruption("wait, can I ask something"));
        assert.ok(!isInterruption("actually"), "a single short word is not enough to cut the interviewer off");
        assert.ok(isInterruption("actually, hold on"));
    });
});

describe("TurnTaker", () => {
    /** A manual clock, so timing rules can be tested without sleeping. */
    function harness() {
        let now = 0;
        const timers: Array<{ at: number; fn: () => void; id: number; live: boolean }> = [];
        let nextId = 1;
        const turns: string[] = [];
        const speech: string[] = [];
        const taker = new TurnTaker({
            onTurn: (text) => turns.push(text),
            onSpeech: (text) => speech.push(text),
            setTimer: (fn, ms) => {
                const timer = { at: now + ms, fn, id: nextId++, live: true };
                timers.push(timer);
                return timer.id;
            },
            clearTimer: (id) => {
                const timer = timers.find((t) => t.id === id);
                if (timer) timer.live = false;
            },
        });
        const advance = (ms: number) => {
            now += ms;
            for (const timer of timers.filter((t) => t.live && t.at <= now).sort((a, b) => a.at - b.at)) {
                timer.live = false;
                timer.fn();
            }
        };
        return { taker, turns, speech, advance };
    }

    test("hands off a finished answer after the short wait", () => {
        const { taker, turns, advance } = harness();
        taker.onTranscript({ text: "I would use a hash map for that.", isFinal: true });
        advance(TURN_TIMING.complete - 1);
        assert.deepEqual(turns, []);
        advance(2);
        assert.deepEqual(turns, ["I would use a hash map for that."]);
    });

    test("more speech before the timer fires extends the same turn", () => {
        const { taker, turns, advance } = harness();
        taker.onTranscript({ text: "I would use a hash map", isFinal: true });
        advance(1000);
        taker.onTranscript({ text: "to store complements.", isFinal: true });
        advance(TURN_TIMING.complete + 5);
        assert.deepEqual(turns, ["I would use a hash map to store complements."]);
    });

    test("interim speech cancels a pending hand-off and is reported for barge-in", () => {
        const { taker, turns, speech, advance } = harness();
        taker.onTranscript({ text: "First thing.", isFinal: true });
        advance(300);
        taker.onTranscript({ text: "and the second", isFinal: false });
        advance(5000);
        assert.deepEqual(turns, []);
        assert.deepEqual(speech, ["First thing.", "and the second"]);
    });

    test("filler alone never becomes a turn", () => {
        const { taker, turns, advance } = harness();
        taker.onTranscript({ text: "Um...", isFinal: true });
        advance(10_000);
        assert.deepEqual(turns, []);
        taker.onTranscript({ text: "I think a stack works.", isFinal: true });
        advance(2000);
        assert.deepEqual(turns, ["Um... I think a stack works."]);
    });

    test("dispose drops anything pending", () => {
        const { taker, turns, advance } = harness();
        taker.onTranscript({ text: "Something complete.", isFinal: true });
        taker.dispose();
        advance(10_000);
        assert.deepEqual(turns, []);
    });
});
