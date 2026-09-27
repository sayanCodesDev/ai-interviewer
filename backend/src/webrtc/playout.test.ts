import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PcmFrameQueue, SAMPLES_PER_FRAME } from "../services/audioQueue";
import { SpeechPlayout, type PlayoutConfig } from "./playout";

/** `ms` of a rising ramp, so every sample is distinguishable and order can be checked. */
let counter = 0;
function speech(ms: number): Buffer {
    const samples = (ms / 20) * SAMPLES_PER_FRAME;
    const out = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) out.writeInt16LE(1 + (counter++ % 30_000), i * 2);
    return out;
}

const CONFIG: PlayoutConfig = { preRollMs: 200, resumeMs: 100, maxWaitMs: 1000, stallGiveUpMs: 3000, maxLeadMs: 200, rateWindowMs: 600 };

function rig(config = CONFIG) {
    let now = 0;
    const events: string[] = [];
    const queue = new PcmFrameQueue(undefined, 1);
    const playout = new SpeechPlayout(queue, config, {
        onStart: (waited) => events.push(`start after ${waited}`),
        onGap: (gap) => events.push(`gap ${gap}`),
    }, () => now);
    /** Runs the pacer for `ms`, one tick per 20 ms, and returns what each tick produced. */
    const run = (ms: number) => {
        const out: Array<Buffer | null> = [];
        for (let i = 0; i < ms / 20; i++) { out.push(playout.next()); now += 20; }
        return out;
    };
    return { playout, queue, events, run, advance: (ms: number) => { now += ms; } };
}

const played = (frames: Array<Buffer | null>) => frames.filter(Boolean).length;

/** A rig where arrival times are under the test's control, for the delivery-speed tests. */
function timedRig(config: PlayoutConfig) {
    let now = 0;
    const queue = new PcmFrameQueue(undefined, 1);
    const playout = new SpeechPlayout(queue, config, {}, () => now);
    const started = () => playout.state === "playing";
    /** Chunks of 40 ms arrive every `intervalMs`; the pacer ticks every 20 ms. Returns when playing began (or -1). */
    const deliver = (chunks: number, intervalMs: number) => {
        let startedAt = -1;
        let nextArrival = 0, sent = 0;
        for (let t = 0; t < 20_000 && sent < chunks + 200; t += 20) {
            now = t;
            while (sent < chunks && nextArrival <= t) { playout.enqueue(speech(40)); sent++; nextArrival += intervalMs; }
            playout.next();
            if (startedAt < 0 && started()) startedAt = t;
            if (startedAt >= 0) break;
        }
        return startedAt;
    };
    return { playout, deliver };
}

describe("SpeechPlayout: sizing the buffer to the delivery speed", () => {
    const ADAPTIVE: PlayoutConfig = { preRollMs: 200, resumeMs: 100, maxWaitMs: 5000, stallGiveUpMs: 8000, maxLeadMs: 3000, rateWindowMs: 600 };

    test("audio arriving faster than real time starts as soon as the minimum is queued", () => {
        const { playout, deliver } = timedRig(ADAPTIVE);
        playout.expectMore(true);
        playout.expectAudio(8000);
        const startedAt = deliver(200, 10); // 40 ms of audio every 10 ms: four times real time
        assert.ok(startedAt >= 0 && startedAt <= 100, `started at ${startedAt} ms`);
    });

    test("audio arriving slower than real time is held back until playing can run to the end without stuttering", () => {
        const fast = timedRig(ADAPTIVE);
        fast.playout.expectMore(true); fast.playout.expectAudio(6000);
        const slow = timedRig(ADAPTIVE);
        slow.playout.expectMore(true); slow.playout.expectAudio(6000);
        const quick = fast.deliver(150, 10);
        const late = slow.deliver(150, 80); // half real time
        assert.ok(late > quick + 800, `slow delivery waited ${late} ms against ${quick} ms`);
    });

    test("the wait is bounded, even for hopelessly slow delivery", () => {
        const { playout, deliver } = timedRig({ ...ADAPTIVE, maxLeadMs: 1000, maxWaitMs: 1500 });
        playout.expectMore(true); playout.expectAudio(20_000);
        const startedAt = deliver(150, 200); // a tenth of real time
        assert.ok(startedAt >= 0 && startedAt <= 1600, `started at ${startedAt} ms`);
    });

    test("with no estimate of the length to come it still behaves like the plain pre-roll", () => {
        const { playout, deliver } = timedRig(ADAPTIVE);
        playout.expectMore(true); // no expectAudio(): nothing is known about what is coming
        const startedAt = deliver(150, 10);
        assert.ok(startedAt >= 0 && startedAt <= 200);
    });
});

describe("SpeechPlayout", () => {
    test("is active from the moment speech is expected until its last word has been played", () => {
        const { playout, run } = rig();
        assert.equal(playout.active, false);
        playout.expectMore(true);
        assert.equal(playout.active, true, "text has gone to the synthesiser but no audio has come back yet");
        playout.enqueue(speech(400));
        run(60);
        assert.equal(playout.active, true, "playing");
        playout.expectMore(false);
        run(600);
        assert.equal(playout.active, false, "all played");
        playout.clear();
        assert.equal(playout.active, false);
    });

    test("stays quiet until there is a little audio, then plays the reply in order", () => {
        const { playout, run, events } = rig();
        assert.equal(played(run(100)), 0, "nothing queued: silence");

        playout.expectMore(true);
        playout.enqueue(speech(100));
        assert.equal(played(run(60)), 0, "100 ms is less than the 200 ms pre-roll, so it is held back");
        playout.enqueue(speech(200));
        const frames = run(200);
        assert.ok(played(frames) >= 9, "once enough is queued it plays continuously");
        assert.equal(events[0]?.startsWith("start after"), true);
    });

    test("a reply that is entirely shorter than the pre-roll still plays once the synthesiser is done", () => {
        const { playout, run } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(60));
        assert.equal(played(run(100)), 0, "held while more might come");
        playout.expectMore(false); // "Flushed": that was all of it
        assert.equal(played(run(100)), 3, "the whole 60 ms is played");
    });

    test("never waits forever for the buffer to fill", () => {
        const { playout, run } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(60));
        const frames = run(1200);
        assert.ok(played(frames) >= 3, "after maxWaitMs it plays what it has");
    });

    test("running dry mid-reply pauses cleanly and resumes after a small re-buffer, not on the next chunk", () => {
        const { playout, run, events } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(400));
        run(500); // plays it all and runs dry
        assert.equal(playout.state, "buffering", "a pause, not a stutter");

        playout.enqueue(speech(40)); // a late trickle
        assert.equal(played(run(100)), 0, "40 ms is below the 100 ms resume threshold");
        playout.enqueue(speech(100));
        assert.ok(played(run(60)) >= 1, "resumes once enough is queued");
        assert.ok(events.some((e) => e.startsWith("gap ")), "the gap is reported");
    });

    test("when the reply ends, the partial last frame is played rather than left to leak into the next reply", () => {
        const { playout, queue, run } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(200));
        playout.enqueue(Buffer.alloc(500)); // 250 samples: less than a frame
        playout.expectMore(false);
        const frames = run(300);
        assert.equal(played(frames), 11, "ten whole frames plus the padded tail");
        assert.equal(queue.pendingBytes, 0, "nothing is left behind");
        assert.equal(playout.state, "idle");
    });

    test("nothing carries over from one reply into the next", () => {
        const { playout, run } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(200));
        playout.enqueue(Buffer.alloc(300));
        playout.expectMore(false);
        run(300);

        playout.expectMore(true);
        playout.enqueue(speech(200));
        playout.expectMore(false);
        const frames = run(300).filter(Boolean) as Buffer[];
        assert.equal(frames.length, 10);
        assert.equal(frames[0]!.readInt16LE(0) > 0, true, "the new reply starts with its own first sample");
    });

    test("barge-in drops everything and goes quiet at once", () => {
        const { playout, run } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(600));
        run(300);
        playout.clear();
        assert.equal(playout.queuedMs, 0);
        assert.equal(played(run(200)), 0);
        assert.equal(playout.state, "idle");
    });

    test("gives up on audio that never arrives", () => {
        const { playout, run, advance } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(400));
        run(500);
        assert.equal(playout.state, "buffering");
        advance(4000);
        run(40);
        assert.equal(playout.state, "idle", "no more waiting after stallGiveUpMs");
    });

    test("a reply that ends with nothing left after a dry spell goes idle without reporting a gap", () => {
        const { playout, run, events } = rig();
        playout.expectMore(true);
        playout.enqueue(speech(400));
        run(500);
        playout.expectMore(false);
        run(100);
        assert.equal(playout.state, "idle");
        assert.ok(!events.some((e) => e.startsWith("gap ")));
    });
});
