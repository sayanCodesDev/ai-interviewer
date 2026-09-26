// Replays how speech audio arrived from the synthesiser against the playout buffer on a virtual clock, and reports
// what a listener would have heard. Shared by scripts/playout-sim.ts and scripts/voice-check.ts.
import { PcmFrameQueue } from "../../src/services/audioQueue";
import { SpeechPlayout, type PlayoutConfig } from "../../src/webrtc/playout";

export interface Arrival { at: number; audioMs: number }
export interface Scenario {
    name: string;
    arrivals: Arrival[];
    /** When the synthesiser says it has finished. */
    flushedAt: number;
    totalAudioMs: number;
    /** When each piece of text went to the synthesiser, and how much speech it should make (a guess from its length). */
    expect?: Array<{ at: number; ms: number }>;
}
export interface Result {
    /** From the first audio arriving to the first word being played. */
    startDelay: number;
    /** From the text being sent to the first word being played: what the listener waits. */
    startFromSend: number;
    /** Times the voice stopped in the middle of the reply. */
    underruns: number;
    /** How long each of those stops lasted. */
    gaps: number[];
    silenceInside: number;
    maxGap: number;
    finished: boolean;
}

/** 48 kHz mono 16-bit speech is 96 bytes per millisecond. */
const BYTES_PER_MS = 96;

export function simulate(scenario: Scenario, config: PlayoutConfig): Result {
    let now = 0;
    const gaps: number[] = [];
    let startDelay = -1;
    let startFromSend = -1;
    const playout = new SpeechPlayout(new PcmFrameQueue(undefined, 1), config, { onGap: (g) => gaps.push(g) }, () => now);
    const pending = [...scenario.arrivals];
    playout.expectMore(true);
    const expectations = [...(scenario.expect ?? [{ at: 0, ms: scenario.totalAudioMs * 1.1 }])];
    let playedFrames = 0;
    let silentInside = 0;
    let started = false;
    let done = false;
    const firstAt = scenario.arrivals[0]!.at;
    for (now = 0; now < 60_000 && !done; now += 20) {
        while (expectations.length && expectations[0]!.at <= now) playout.expectAudio(expectations.shift()!.ms);
        while (pending.length && pending[0]!.at <= now) {
            const arrival = pending.shift()!;
            playout.enqueue(Buffer.alloc(Math.round(arrival.audioMs * BYTES_PER_MS) & ~1));
        }
        if (now >= scenario.flushedAt && pending.length === 0) playout.expectMore(false);
        const frame = playout.next();
        if (frame) {
            playedFrames++;
            if (!started) { started = true; startDelay = now - firstAt; startFromSend = now; }
        } else if (started && playedFrames * 20 < scenario.totalAudioMs - 20) {
            silentInside += 20;
        }
        if (started && playedFrames * 20 >= scenario.totalAudioMs - 20) done = true;
    }
    return { startDelay, startFromSend, underruns: gaps.length, gaps, silenceInside: silentInside, maxGap: Math.max(0, ...gaps), finished: done };
}
