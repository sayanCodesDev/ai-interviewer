import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyGain, gainFromDb } from "./loudness";

function pcm(samples: number[]): Buffer {
    const out = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => out.writeInt16LE(s, i * 2));
    return out;
}
const read = (buffer: Buffer) => Array.from({ length: buffer.length / 2 }, (_, i) => buffer.readInt16LE(i * 2));
const rms = (samples: number[]) => Math.sqrt(samples.reduce((n, s) => n + s * s, 0) / samples.length);

describe("gain with a soft limiter", () => {
    test("3 dB is about 1.41 times", () => {
        assert.ok(Math.abs(gainFromDb(3) - 1.4125) < 0.001);
        assert.equal(gainFromDb(0), 1);
    });

    test("quiet speech is made louder by the requested amount", () => {
        const wave = Array.from({ length: 480 }, (_, i) => Math.round(3000 * Math.sin(i / 5)));
        const louder = read(applyGain(pcm(wave), gainFromDb(3)));
        const ratio = rms(louder) / rms(wave);
        assert.ok(Math.abs(ratio - 1.41) < 0.02, `ratio ${ratio}`);
    });

    test("loud peaks are rounded off, never clipped or wrapped", () => {
        const wave = Array.from({ length: 480 }, (_, i) => Math.round(30000 * Math.sin(i / 4)));
        const out = read(applyGain(pcm(wave), gainFromDb(6)));
        assert.ok(Math.max(...out) <= 32767 && Math.min(...out) >= -32768);
        assert.ok(Math.max(...out) > 29000, "still loud");
        // A hard clip leaves runs of identical samples at the ceiling; a soft limiter does not.
        const atCeiling = out.filter((s) => Math.abs(s) >= 32760).length;
        assert.ok(atCeiling < 5, `${atCeiling} samples at the ceiling`);
    });

    test("the limiter is smooth: a louder input never produces a quieter output", () => {
        let previous = -1;
        for (let input = 0; input <= 32000; input += 500) {
            const out = read(applyGain(pcm([input]), 2))[0]!;
            assert.ok(out >= previous, `input ${input} gave ${out} after ${previous}`);
            previous = out;
        }
    });

    test("silence stays silent, and a gain of one changes nothing", () => {
        assert.deepEqual(read(applyGain(pcm([0, 0, 0]), 2)), [0, 0, 0]);
        const original = pcm([1, -2, 300]);
        assert.deepEqual(read(applyGain(Buffer.from(original), 1)), read(original));
    });
});
