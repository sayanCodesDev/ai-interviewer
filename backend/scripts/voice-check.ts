// Checks the interviewer's voice from THIS machine, using your own keys and network:
//
//   npx tsx scripts/voice-check.ts
//
// It sends a few interviewer-style replies to the speech service the way a live call does, records exactly when each
// piece of audio arrives, and then replays that recording through the same smoothing buffer the server uses. The result says
// whether the connection to the speech service is steady, whether this computer keeps time well enough to play audio,
// and (if not) which VOICE_PREROLL_MS to set. It costs a few thousandths of a cent per run.
//
//   VOICE=aura-2-apollo-en   another voice        ROUNDS=3   more samples (default 2)
//   SAVE=/tmp/trace.json     keep the recording (for TRACES=/tmp/trace.json npx tsx scripts/playout-sim.ts)
import fs from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { config } from "../src/config/env";
import { connectTts } from "../src/voice/tts";
import { estimateSpeechMs, speechText } from "../src/voice/speechText";
import { DEFAULT_PLAYOUT, type PlayoutConfig } from "../src/webrtc/playout";
import { simulate, type Scenario } from "./lib/playoutSimulation";

const VOICE = process.env.VOICE ?? "aura-2-thalia-en";
const ROUNDS = Math.max(1, Number(process.env.ROUNDS ?? 2));
/** How long the language model takes between two sentences of one reply, roughly. */
const SENTENCE_GAP_MS = 250;
/**
 * A pause this long in the middle of a reply is heard as the voice stopping. A 20 ms hole is one frame: at the join between
 * two sentences nobody notices it, but dozens of them inside words are the crackling, stuttering voice.
 */
const AUDIBLE_GAP_MS = 40;

const REPLIES: string[][] = [
    ["Thanks.", "Let's move on."],
    ["Great.", "Tell me a little about what you've been working on recently."],
    ["Hi, I'm Thalia, and I'll be your interviewer today.", "We'll talk about your background, work through a coding problem, and finish with a few questions.", "Ready to start?"],
    ["That makes sense.", "You mentioned caching the results.", "What happens when the cache gets stale, and how would you handle invalidation across several servers?"],
    ["Okay, that works for small inputs, but think about what happens when the list has a million numbers and most of them repeat, so where does the time actually go?"],
];

interface Recording { sentences: string[]; chunks: Array<{ t: number; ms: number }>; flushedAt: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : 0;
};

async function record(sentences: string[]): Promise<Recording> {
    const connection = await connectTts(VOICE);
    const raw = (connection as any).socket;
    raw.binaryType = "nodebuffer";
    if (raw.socket) raw.socket.binaryType = "nodebuffer";
    const recording: Recording = { sentences, chunks: [], flushedAt: -1 };
    let startedAt = 0;
    let finished!: () => void;
    const done = new Promise<void>((resolve) => { finished = resolve; });
    raw.addEventListener("message", async (event: any) => {
        let data = event.data;
        if (typeof Blob !== "undefined" && data instanceof Blob) data = Buffer.from(await data.arrayBuffer());
        if (typeof data === "string") {
            try { if (JSON.parse(data).type === "Flushed") { recording.flushedAt = Date.now() - startedAt; finished(); } } catch { /* not a control message */ }
            return;
        }
        const audio = Buffer.isBuffer(data) ? data : Buffer.from(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
        recording.chunks.push({ t: Date.now() - startedAt, ms: audio.length / 96 });
    });
    connection.on("error", () => finished());
    startedAt = Date.now();
    for (let i = 0; i < sentences.length; i++) {
        if (i > 0) await sleep(SENTENCE_GAP_MS);
        connection.sendText({ type: "Speak", text: speechText(sentences[i]!) });
    }
    connection.sendFlush({ type: "Flush" });
    await Promise.race([done, sleep(20_000)]);
    try { connection.close(); } catch { /* already closed */ }
    return recording;
}

function scenarioOf(recording: Recording, name: string): Scenario {
    return {
        name,
        arrivals: recording.chunks.map((c) => ({ at: c.t, audioMs: c.ms })),
        flushedAt: recording.flushedAt < 0 ? (recording.chunks.at(-1)?.t ?? 0) + 50 : recording.flushedAt,
        totalAudioMs: recording.chunks.reduce((sum, c) => sum + c.ms, 0),
        expect: recording.sentences.map((sentence, k) => ({ at: k * SENTENCE_GAP_MS, ms: estimateSpeechMs(speechText(sentence)) })),
    };
}

interface Outcome { stops: number; audible: number; repliesWithStops: number; replies: number; meanStart: number; worstStart: number; smooth: boolean }
function judge(scenarios: Scenario[], settings: PlayoutConfig): Outcome {
    const results = scenarios.map((scenario) => simulate(scenario, settings));
    const starts = results.map((r) => r.startFromSend);
    const stops = results.reduce((sum, r) => sum + r.gaps.length, 0);
    const audible = results.reduce((sum, r) => sum + r.gaps.filter((g) => g >= AUDIBLE_GAP_MS).length, 0);
    return {
        stops,
        audible,
        repliesWithStops: results.filter((r) => r.gaps.length > 0).length,
        replies: results.length,
        meanStart: starts.reduce((sum, v) => sum + v, 0) / Math.max(1, starts.length),
        worstStart: Math.max(0, ...starts),
        // An occasional one-frame hole at a sentence join is fine; anything longer, or many of them, is not.
        smooth: audible === 0 && stops <= Math.ceil(results.length / 4),
    };
}
const describe = (o: Outcome) => (o.stops === 0 ? "no stops in any reply" : `${o.stops} stops in ${o.repliesWithStops}/${o.replies} replies (${o.audible} of them 40 ms or longer)`);

async function main() {
    if (!config.deepgramApiKey) {
        console.error("DEEPGRAM_API_KEY is not set, so there is no voice to check. Add it to backend/.env.");
        process.exit(1);
    }
    console.log(`Checking the voice "${VOICE}" from this machine (${ROUNDS * REPLIES.length} short replies)...\n`);

    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();
    const recordings: Recording[] = [];
    try {
        for (let round = 0; round < ROUNDS; round++) {
            for (const sentences of REPLIES) {
                recordings.push(await record(sentences));
                await sleep(200);
            }
        }
    } catch (error) {
        const message = (error as Error).message;
        console.error(`Could not reach the speech service: ${message}`);
        console.error(/\b(401|403)\b/.test(message)
            ? "The service refused the request: the key in DEEPGRAM_API_KEY is wrong or expired, or the voice name is not one your account can use."
            : "Check the internet connection, and that api.deepgram.com is not blocked by a firewall or VPN.");
        process.exit(1);
    }
    loop.disable();

    const usable = recordings.filter((r) => r.chunks.length > 0);
    if (usable.length === 0) {
        console.error("The speech service accepted the connection but sent no audio. Check the voice name and the account's balance.");
        process.exit(1);
    }
    if (process.env.SAVE) fs.writeFileSync(process.env.SAVE, JSON.stringify(usable));

    // ---- what the speech service did
    const firstAudio = usable.map((r) => r.chunks[0]!.t);
    const speeds = usable.filter((r) => r.chunks.length > 60).map((r) => {
        const audio = r.chunks.reduce((sum, c) => sum + c.ms, 0);
        return audio / Math.max(1, r.chunks.at(-1)!.t - r.chunks[0]!.t);
    });
    let worstStall = 0;
    for (const r of usable) for (let i = 1; i < r.chunks.length; i++) worstStall = Math.max(worstStall, r.chunks[i]!.t - r.chunks[i - 1]!.t);
    console.log("The speech service");
    console.log(`  first sound after the text is sent: median ${percentile(firstAudio, 50)} ms, slowest ${Math.max(...firstAudio)} ms`);
    console.log(`  delivery speed: median ${percentile(speeds, 50).toFixed(1)}x real time, slowest reply ${Math.min(...speeds).toFixed(1)}x  (below 1.0x it cannot keep up with speaking)`);
    console.log(`  longest silence between two pieces of audio: ${worstStall} ms`);

    // ---- what this computer did
    const lagP99 = loop.percentile(99) / 1e6;
    const lagMax = loop.max / 1e6;
    console.log("\nThis computer");
    console.log(`  the 20 ms audio clock is driven by the event loop: it ran late by ${lagP99.toFixed(0)} ms (p99) and ${lagMax.toFixed(0)} ms (worst) while this ran`);

    // ---- the smoothing buffer, on that recording
    const scenarios = usable.map((r, i) => scenarioOf(r, `reply ${i + 1}`));
    const current: PlayoutConfig = { ...DEFAULT_PLAYOUT, preRollMs: config.voicePreRollMs, resumeMs: config.voiceResumeMs, maxLeadMs: config.voiceMaxLeadMs };
    const without = judge(scenarios, { preRollMs: 0, resumeMs: 0, maxWaitMs: 0, stallGiveUpMs: DEFAULT_PLAYOUT.stallGiveUpMs, maxLeadMs: 0, rateWindowMs: DEFAULT_PLAYOUT.rateWindowMs });
    const now = judge(scenarios, current);
    console.log("\nWhat the interviewer's voice would sound like on this connection");
    console.log(`  without smoothing: ${describe(without)}; first word ${without.meanStart.toFixed(0)} ms after the text is sent`);
    console.log(`  with your settings (VOICE_PREROLL_MS=${config.voicePreRollMs}, VOICE_RESUME_MS=${config.voiceResumeMs}, VOICE_MAX_LEAD_MS=${config.voiceMaxLeadMs}): ${describe(now)}; first word ${now.meanStart.toFixed(0)} ms after the text is sent (slowest ${now.worstStart.toFixed(0)} ms)`);

    // ---- verdict
    console.log("\nVerdict");
    let problems = 0;
    if (lagP99 > 40) {
        problems++;
        console.log("  - This computer is too busy to keep steady time: the voice will break up here no matter what the network does. Close heavy programs (video calls, builds, many browser tabs) and run this again.");
    }
    if (!now.smooth) {
        problems++;
        const tries: Array<[number, number, number]> = [[600, 300, 3000], [800, 400, 4000], [1000, 500, 5000], [1500, 700, 6000]];
        let advice = "";
        for (const [preRollMs, resumeMs, maxLeadMs] of tries) {
            const outcome = judge(scenarios, { ...current, preRollMs, resumeMs, maxLeadMs });
            if (outcome.smooth) {
                advice = ` Set VOICE_PREROLL_MS=${preRollMs} VOICE_RESUME_MS=${resumeMs} VOICE_MAX_LEAD_MS=${maxLeadMs} in backend/.env: the voice then stays smooth here, and the first word comes about ${outcome.meanStart.toFixed(0)} ms after the text is sent.`;
                break;
            }
        }
        console.log(`  - The speech service reaches you unevenly, and even the buffer runs dry.${advice || " No buffer setting fixes this; the connection to the speech service itself is the problem (try another network, or turn off a VPN)."}`);
    }
    if (Math.min(...speeds) < 1) {
        problems++;
        console.log("  - The speech service delivered audio slower than it plays for at least one reply, so pauses in the middle are unavoidable on this connection.");
    }
    if (problems === 0) {
        console.log(`  Nothing to fix here. ${without.smooth ? "Speech arrives smoothly on this connection." : `Speech arrives in uneven bursts, as it does from any speech service; the smoothing buffer turns ${without.stops} stops into ${now.stops}.`}`);
        console.log("  If the voice still glitches in the browser, the cause is after the server: check the room for the \"Weak connection\" notice, try wired headphones instead of Bluetooth, and see Voice quality in docs/DEPLOYMENT.md.");
    }
    process.exit(0);
}

void main();
