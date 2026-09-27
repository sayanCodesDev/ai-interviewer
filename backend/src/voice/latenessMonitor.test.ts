import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LatenessMonitor } from "./latenessMonitor";

/** Feeds one tick every 20 ms for the given time, with the lateness a function of the tick number. */
function run(monitor: LatenessMonitor, from: number, ms: number, lateness: (tick: number) => number) {
    const warnings: Array<{ at: number; lateTicks: number; worstMs: number }> = [];
    for (let t = from, tick = 0; t < from + ms; t += 20, tick++) {
        const warning = monitor.note(lateness(tick), t);
        if (warning) warnings.push({ at: t, ...warning });
    }
    return warnings;
}

describe("LatenessMonitor", () => {
    test("stays quiet while the clock keeps time", () => {
        assert.deepEqual(run(new LatenessMonitor(), 1000, 60_000, () => 3), []);
    });

    test("one unlucky pause is not a warning", () => {
        assert.deepEqual(run(new LatenessMonitor(), 1000, 30_000, (tick) => (tick === 100 ? 250 : 2)), []);
    });

    test("warns, with the numbers, when the clock runs late again and again", () => {
        const warnings = run(new LatenessMonitor(), 1000, 12_000, (tick) => (tick % 50 === 0 ? 90 : 2));
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0]!.lateTicks >= 5);
        assert.equal(warnings[0]!.worstMs, 90);
    });

    test("does not repeat itself within a minute, then warns again if it is still happening", () => {
        const late = (tick: number) => (tick % 20 === 0 ? 100 : 2);
        const warnings = run(new LatenessMonitor(), 1000, 130_000, late);
        assert.ok(warnings.length >= 2 && warnings.length <= 3, `got ${warnings.length}`);
        for (let i = 1; i < warnings.length; i++) assert.ok(warnings[i]!.at - warnings[i - 1]!.at >= 60_000);
    });

    test("a busy stretch that has ended does not keep warning", () => {
        const monitor = new LatenessMonitor();
        const first = run(monitor, 1000, 12_000, (tick) => (tick % 20 === 0 ? 100 : 2));
        const after = run(monitor, 13_000, 120_000, () => 2);
        assert.equal(first.length, 1);
        assert.deepEqual(after, []);
    });
});
