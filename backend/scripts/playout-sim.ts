// Replays how speech audio arrives from a synthesiser (several realistic and several bad patterns) against the
// playout buffer on a virtual clock, and reports what a listener would hear: how long until the first word,
// how many times the voice stopped mid-reply, and how much silence was inserted. Used to choose and check the
// buffer settings without spending anything on a speech service.
//
//   npx tsx scripts/playout-sim.ts
import fs from "node:fs";
import { estimateSpeechMs, speechText } from "../src/voice/speechText";
import { DEFAULT_PLAYOUT, type PlayoutConfig } from "../src/webrtc/playout";
import { simulate, type Arrival, type Scenario } from "./lib/playoutSimulation";

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

const policies: Array<[string, PlayoutConfig]> = [
    ["no buffer (the old behaviour)", { preRollMs: 0, resumeMs: 0, maxWaitMs: 0, stallGiveUpMs: 6000, maxLeadMs: 0, rateWindowMs: 600 }],
    ["fixed 350 / 220 (no adapting)", { ...DEFAULT_PLAYOUT, maxLeadMs: 350 }],
    ["adaptive (default)", DEFAULT_PLAYOUT],
];
const fixed = (preRollMs: number, resumeMs: number): PlayoutConfig => ({ ...DEFAULT_PLAYOUT, preRollMs, resumeMs, maxLeadMs: 0 });
policies.push(["fixed 600 / 300", fixed(600, 300)], ["fixed 800 / 400", fixed(800, 400)], ["fixed 1000 / 500", fixed(1000, 500)]);
policies.push(["fixed 200 / 150", fixed(200, 150)], ["fixed 250 / 200", fixed(250, 200)]);
policies.push(["adaptive 250 / 180", { ...DEFAULT_PLAYOUT, preRollMs: 250, resumeMs: 180 }], ["adaptive 200 / 150", { ...DEFAULT_PLAYOUT, preRollMs: 200, resumeMs: 150 }], ["adaptive 150 / 120", { ...DEFAULT_PLAYOUT, preRollMs: 150, resumeMs: 120 }]);
const only = process.argv[2];

// With TRACES=<file of real recorded deliveries> the buffer is judged on what the speech service really did.
if (process.env.TRACES) {
    const traces = JSON.parse(fs.readFileSync(process.env.TRACES, "utf8")) as Array<{ sentences: string[]; chunks: Array<{ t: number; ms: number }>; flushedAt: number }>;
    const gap = Number(process.env.TRACE_GAP_MS ?? 250);
    const real: Scenario[] = traces.map((tr, i) => ({
        name: `recording ${i + 1}: ${tr.sentences.join(" ").slice(0, 36)}`,
        arrivals: tr.chunks.map((c) => ({ at: c.t, audioMs: c.ms })),
        flushedAt: tr.flushedAt,
        totalAudioMs: tr.chunks.reduce((sum, c) => sum + c.ms, 0),
        expect: tr.sentences.map((sentence, k) => ({ at: k * gap, ms: estimateSpeechMs(speechText(sentence)) })),
    }));
    console.log(`${real.length} real recordings\n`);
    for (const [label, config] of policies) {
        if (only && !label.includes(only)) continue;
        const results = real.map((scenario) => simulate(scenario, config));
        const starts = results.map((r) => r.startFromSend).sort((a, b) => a - b);
        const mean = starts.reduce((sum, v) => sum + v, 0) / starts.length;
        console.log(`${label.padEnd(34)} first word after send: mean ${String(Math.round(mean)).padStart(5)} ms, worst ${String(Math.round(starts[starts.length - 1]!)).padStart(5)} ms | replies that stopped mid-way ${results.filter((r) => r.underruns > 0).length}/${results.length} (${results.reduce((sum, r) => sum + r.underruns, 0)} stops, ${results.reduce((sum, r) => sum + r.silenceInside, 0)} ms silence, longest ${Math.round(Math.max(...results.map((r) => r.maxGap)))} ms)${results.every((r) => r.finished) ? "" : " | DID NOT FINISH"}`);
        if (process.env.VERBOSE) results.forEach((r, i) => console.log(`     ${real[i]!.name.padEnd(48)} start ${String(Math.round(r.startFromSend)).padStart(5)} ms | stops ${r.underruns} | silence ${r.silenceInside} ms`));
    }
    process.exit(0);
}

for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    for (const [label, config] of policies) {
        if (only && !label.includes(only)) continue;
        const r = simulate(scenario, config);
        console.log(`  ${label.padEnd(34)} first word after ${String(Math.round(r.startDelay)).padStart(5)} ms | voice stopped mid-reply ${String(r.underruns).padStart(2)}x | silence inside ${String(r.silenceInside).padStart(5)} ms | longest ${String(Math.round(r.maxGap)).padStart(5)} ms${r.finished ? "" : " | DID NOT FINISH"}`);
    }
}
