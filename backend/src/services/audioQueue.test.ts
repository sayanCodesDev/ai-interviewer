import test from "node:test";
import assert from "node:assert/strict";
import { PcmFrameQueue, FRAME_BYTES, SAMPLES_PER_FRAME } from "./audioQueue";

/** `count` mono 16-bit samples starting at `start`, as Deepgram would send them. */
function monoChunk(count: number, start = 0): Buffer {
    const buf = Buffer.allocUnsafe(count * 2);
    for (let i = 0; i < count; i++) buf.writeInt16LE((start + i) % 30000, i * 2);
    return buf;
}

/** Reads a stereo frame back as the mono samples it was built from. */
function framePairs(frame: Buffer): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < frame.length; i += 4) {
        pairs.push([frame.readInt16LE(i), frame.readInt16LE(i + 2)]);
    }
    return pairs;
}

test("mono is interleaved to identical stereo channels", () => {
    const q = new PcmFrameQueue();
    q.enqueueMono(monoChunk(SAMPLES_PER_FRAME));
    const frame = q.readFrame();
    assert.ok(frame, "expected a full frame");
    assert.equal(frame!.length, FRAME_BYTES);
    for (const [left, right] of framePairs(frame!)) {
        assert.equal(left, right, "left and right channels must match for mono input");
    }
});

test("underrun returns null instead of a short frame", () => {
    const q = new PcmFrameQueue();
    q.enqueueMono(monoChunk(SAMPLES_PER_FRAME - 1));
    assert.equal(q.readFrame(), null);
    q.enqueueMono(monoChunk(1));
    assert.equal(q.readFrame()?.length, FRAME_BYTES);
});

test("samples survive in order across many small chunks", () => {
    const q = new PcmFrameQueue();
    // 7 samples at a time never aligns to a 960-sample frame boundary.
    let produced = 0;
    while (produced < SAMPLES_PER_FRAME * 3) {
        q.enqueueMono(monoChunk(7, produced));
        produced += 7;
    }

    let expected = 0;
    for (let f = 0; f < 3; f++) {
        const frame = q.readFrame();
        assert.ok(frame, `expected frame ${f}`);
        for (const [left] of framePairs(frame!)) {
            assert.equal(left, expected % 30000, `sample ${expected} out of order`);
            expected++;
        }
    }
    assert.equal(expected, SAMPLES_PER_FRAME * 3);
});

test("an odd trailing byte is carried, not dropped (would be white noise)", () => {
    const q = new PcmFrameQueue();
    const full = monoChunk(SAMPLES_PER_FRAME);

    // Split mid-sample: first part ends on an odd byte boundary.
    const splitAt = 101; // odd
    q.enqueueMono(full.subarray(0, splitAt));
    q.enqueueMono(full.subarray(splitAt));

    const frame = q.readFrame();
    assert.ok(frame, "expected a full frame despite the mid-sample split");
    const pairs = framePairs(frame!);
    for (let i = 0; i < pairs.length; i++) {
        assert.equal(pairs[i]![0], i % 30000, `sample ${i} corrupted by the odd-byte split`);
    }
});

test("a lone odd byte yields nothing until its partner arrives", () => {
    const q = new PcmFrameQueue();
    q.enqueueMono(Buffer.from([0x11]));
    assert.equal(q.pendingBytes, 0);
    q.enqueueMono(Buffer.from([0x22]));
    // One mono sample -> 4 stereo bytes.
    assert.equal(q.pendingBytes, 4);
});

test("reset drops buffered audio and the carry byte", () => {
    const q = new PcmFrameQueue();
    q.enqueueMono(monoChunk(SAMPLES_PER_FRAME * 2));
    q.enqueueMono(Buffer.from([0x11])); // leaves a carry byte
    q.reset();

    assert.equal(q.pendingBytes, 0);
    assert.equal(q.availableFrames, 0);
    assert.equal(q.readFrame(), null);

    // The stale carry byte must not corrupt the next turn.
    q.enqueueMono(monoChunk(SAMPLES_PER_FRAME));
    const frame = q.readFrame();
    assert.ok(frame);
    assert.equal(framePairs(frame!)[0]![0], 0, "carry byte from before reset leaked");
});

test("queue is bounded and drops the oldest audio when overfull", () => {
    const maxBytes = FRAME_BYTES * 4;
    const q = new PcmFrameQueue(maxBytes);
    for (let i = 0; i < 40; i++) q.enqueueMono(monoChunk(SAMPLES_PER_FRAME));
    assert.ok(
        q.pendingBytes <= maxBytes + FRAME_BYTES,
        `queue grew to ${q.pendingBytes} bytes, cap is ${maxBytes}`
    );
    // Still serving playable frames after the drops.
    assert.equal(q.readFrame()?.length, FRAME_BYTES);
});

test("availableFrames counts whole frames only", () => {
    const q = new PcmFrameQueue();
    q.enqueueMono(monoChunk(SAMPLES_PER_FRAME * 2 + 5));
    assert.equal(q.availableFrames, 2);
});

test("enqueuing a large stream stays linear, not quadratic", () => {
    // The regression this class exists for: 30s of audio in realistic chunk sizes.
    const q = new PcmFrameQueue();
    const started = process.hrtime.bigint();
    for (let i = 0; i < 3000; i++) q.enqueueMono(monoChunk(480));
    let frames = 0;
    while (q.readFrame() !== null) frames++;
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.equal(frames, 1500, "expected 30s of audio as 20ms frames");
    assert.ok(elapsedMs < 1000, `queue took ${elapsedMs.toFixed(0)}ms for 30s of audio`);
});

import { nextPacingStep } from "./audioQueue";

const INTERVAL = 20;
const MAX_CATCHUP = 10;
const step = (now: number, dueAt: number) => nextPacingStep(now, dueAt, INTERVAL, MAX_CATCHUP);

test("pacer emits nothing before a frame is due", () => {
    const s = step(1000, 1020);
    assert.equal(s.frames, 0);
    assert.equal(s.nextDueAt, 1020, "the due time must not move when nothing is sent");
});

test("pacer emits one frame exactly on time", () => {
    const s = step(1000, 1000);
    assert.equal(s.frames, 1);
    assert.equal(s.nextDueAt, 1020);
});

test("pacer catches up after a stalled event loop", () => {
    // The tick ran 85ms late: 4 whole frames plus the one now due.
    const s = step(1085, 1000);
    assert.equal(s.frames, 5);
    assert.equal(s.nextDueAt, 1100, "due time advances by exactly the audio emitted");
});

test("pacer resynchronises instead of bursting when hopelessly behind", () => {
    // A 3 second stall would owe 150 frames; that must not be dumped at once.
    const s = step(4000, 1000);
    assert.equal(s.frames, MAX_CATCHUP);
    assert.equal(s.nextDueAt, 4000 + MAX_CATCHUP * INTERVAL, "clock restarts from now");
});

test("pacing clock tracks real time over a long run", () => {
    // 5s of 5ms ticks with jitter: emitted audio must match elapsed time closely,
    // which is what keeps RTP timestamps aligned with the receiver's playout clock.
    let dueAt = 0;
    let emitted = 0;
    for (let now = 0; now <= 5000; now += 5) {
        const jittered = now + (now % 37 === 0 ? 3 : 0);
        const s = step(jittered, dueAt);
        dueAt = s.nextDueAt;
        emitted += s.frames;
    }
    const emittedMs = emitted * INTERVAL;
    assert.ok(
        Math.abs(emittedMs - 5000) <= INTERVAL * 2,
        `emitted ${emittedMs}ms of audio for 5000ms of real time`
    );
});
