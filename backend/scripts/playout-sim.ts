// Replays how speech audio arrives from a synthesiser (several realistic and several bad patterns) against the
// playout buffer on a virtual clock, and reports what a listener would hear: how long until the first word,
// how many times the voice stopped mid-reply, and how much silence was inserted. Used to choose and check the
// buffer settings without spending anything on a speech service.
//
//   npx tsx scripts/playout-sim.ts
import { PcmFrameQueue, SAMPLES_PER_FRAME } from "../src/services/audioQueue";
import { DEFAULT_PLAYOUT, SpeechPlayout, type PlayoutConfig } from "../src/webrtc/playout";

interface Arrival { at: number; audioMs: number; }
interface Scenario { name: string; arrivals: Arrival[]; /** when the synthesiser says it has finished */ flushedAt: number; totalAudioMs: number; }

const CHUNK_MS = 40;
function chunks(count: number, at: (k: number) => number): Arrival[] {
    return Array.from({ length: count }, (_, k) => ({ at: at(k), audioMs: CHUNK_MS }));
}
const monotone = (arr: Arrival[]) => { for (let i = 1; i < arr.length; i++) arr[i]!.at = Math.max(arr[i]!.at, arr[i - 1]!.at); return arr; };
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

/** Measured from Deepgram: first audio at ~390 ms, about real time for the first second, then 2-3x. */
const deepgram = (k: number) => (k < 3 ? 390 + k * 15 : k < 20 ? 419 + (k - 3) * 42 : k < 40 ? 1135 + (k - 20) * 17 : k < 60 ? 1476 + (k - 40) * 22 : k < 100 ? 1911 + (k - 60) * 0.5 : 1929 + (k - 100) * 11);

const N = 250; // 10 s of speech
const scenarios: Scenario[] = [
    { name: "normal (as measured)", arrivals: chunks(N, deepgram), flushedAt: deepgram(N) + 30, totalAudioMs: N * CHUNK_MS },
    { name: "slow provider, 0.6x real time", arrivals: chunks(N, (k) => 400 + k * (CHUNK_MS / 0.6)), flushedAt: 400 + N * (CHUNK_MS / 0.6), totalAudioMs: N * CHUNK_MS },
    { name: "hiccups: 400 ms stall every ~2 s", arrivals: monotone(chunks(N, (k) => deepgram(k) + Math.floor(k / 50) * 400)), flushedAt: deepgram(N) + Math.floor(N / 50) * 400 + 30, totalAudioMs: N * CHUNK_MS },
    { name: "jitter: each chunk 0-150 ms late", arrivals: monotone(chunks(N, (k) => deepgram(k) + rnd() * 150)), flushedAt: deepgram(N) + 200, totalAudioMs: N * CHUNK_MS },
    {
        name: "three sentences, model 1.2 s between them",
        arrivals: monotone([
            ...chunks(75, (k) => 350 + k * 14),
            ...chunks(75, (k) => 350 + 75 * 14 + 1200 + k * 14),
            ...chunks(75, (k) => 350 + 2 * (75 * 14 + 1200) + k * 14),
        ]),
        flushedAt: 350 + 2 * (75 * 14 + 1200) + 75 * 14 + 30, totalAudioMs: 225 * CHUNK_MS,
    },
    { name: "slow for the first second, then fine", arrivals: monotone(chunks(N, (k) => (k < 25 ? 600 + k * 90 : 600 + 25 * 90 + (k - 25) * 12))), flushedAt: 600 + 25 * 90 + 225 * 12 + 30, totalAudioMs: N * CHUNK_MS },
];

interface Result { startDelay: number; underruns: number; silenceInside: number; maxGap: number; finished: boolean }

function simulate(scenario: Scenario, config: PlayoutConfig): Result {
    let now = 0;
    const gaps: number[] = [];
    let startDelay = -1;
    const playout = new SpeechPlayout(new PcmFrameQueue(undefined, 1), config, { onGap: (g) => gaps.push(g) }, () => now);
    const pending = [...scenario.arrivals];
    playout.expectMore(true);
    playout.expectAudio(scenario.totalAudioMs * 1.1); // the caller's guess from the text length: a little off
    let playedFrames = 0, silentInside = 0, started = false, done = false;
    const firstAt = scenario.arrivals[0]!.at;
    for (now = 0; now < 60_000 && !done; now += 20) {
        while (pending.length && pending[0]!.at <= now) { pending.shift(); playout.enqueue(Buffer.alloc((CHUNK_MS / 20) * SAMPLES_PER_FRAME * 2)); }
        if (now >= scenario.flushedAt && pending.length === 0) playout.expectMore(false);
        const frame = playout.next();
        if (frame) { playedFrames++; if (!started) { started = true; startDelay = now - firstAt; } }
        else if (started && playedFrames * 20 < scenario.totalAudioMs - 20) silentInside += 20;
        if (started && playedFrames * 20 >= scenario.totalAudioMs - 20) done = true;
    }
    return { startDelay, underruns: gaps.length, silenceInside: silentInside, maxGap: Math.max(0, ...gaps), finished: done };
}

const policies: Array<[string, PlayoutConfig]> = [
    ["no buffer (the old behaviour)", { preRollMs: 0, resumeMs: 0, maxWaitMs: 0, stallGiveUpMs: 6000, maxLeadMs: 0, rateWindowMs: 600 }],
    ["fixed 350 / 220 (no adapting)", { ...DEFAULT_PLAYOUT, maxLeadMs: 350 }],
    ["adaptive (default)", DEFAULT_PLAYOUT],
];
const only = process.argv[2];
for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    for (const [label, config] of policies) {
        if (only && !label.includes(only)) continue;
        const r = simulate(scenario, config);
        console.log(`  ${label.padEnd(34)} first word after ${String(Math.round(r.startDelay)).padStart(5)} ms | voice stopped mid-reply ${String(r.underruns).padStart(2)}x | silence inside ${String(r.silenceInside).padStart(5)} ms | longest ${String(Math.round(r.maxGap)).padStart(5)} ms${r.finished ? "" : " | DID NOT FINISH"}`);
    }
}
