// Opens many simultaneous interviews against a running server and reports what it cost, so capacity claims
// are measured rather than guessed. Every candidate connects over real WebRTC (ICE, DTLS, data channel, and the
// interviewer's audio stream flowing back), then talks through a scripted interview by typing.
//
// Start the server for it in text mode with the mock model, so nothing external is called or paid for:
//
//   npx tsx scripts/mock-llm.ts &
//   DATABASE_URL=postgresql://postgres@127.0.0.1:5544/ai_interviewer_dev JWT_SECRET=loadtest-secret-loadtest-secret-1234 \
//     METRICS_TOKEN=loadtest LLM_BASE_URL=http://127.0.0.1:2099/v1 LLM_API_KEY=mock VOICE_MODE=text \
//     MAX_CONCURRENT_INTERVIEWS=500 MAX_INTERVIEWS_PER_DAY=0 npx tsx src/index.ts &
//   DATABASE_URL=... JWT_SECRET=loadtest-secret-loadtest-secret-1234 METRICS_TOKEN=loadtest npx tsx scripts/load-test.ts 20
//
// What it does not cover: speech recognition and synthesis (their cost is mostly the providers' network time), and the
// language model itself. It does cover everything the server does per call except those. Refuses non-local databases.
import { RTCPeerConnection } from "werift";
import { prisma } from "../lib/prisma";
import { config } from "../src/config/env";
import { signAccessToken } from "../src/auth/tokens";
import { fallbackAnalysis } from "../src/interview/jdAnalysis";
import { buildPlan } from "../src/interview/planBuilder";
import { JS_SOLUTIONS } from "../src/interview/problems/verify/jsSolutions";

const host = new URL(config.databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error(`Refusing to load-test against a non-local database (${host}).`);
    process.exit(1);
}

const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${config.port}`;
const METRICS_TOKEN = process.env.METRICS_TOKEN;
const CALLS = Number(process.argv[2] ?? 10);
const RAMP_MS = Number(process.env.RAMP_MS ?? 100); // pause between starting successive calls
// A real interview lasts many minutes with the call open and mostly quiet. Once every call is connected, hold them all
// open this long before the scripted conversation runs, and measure what just keeping that many calls open costs.
const HOLD_SECONDS = Number(process.env.HOLD_SECONDS ?? 0);

const ANSWERS = [
    "Hi, I'm Sam. I'm a backend engineer with five years of experience, mostly Go and PostgreSQL, building payment APIs.",
    "The project I'm proudest of is an idempotent payments API. I owned the write path and stored idempotency keys with a request hash in the same transaction as the ledger entry.",
    "The hardest part was two identical requests racing, which we solved with a unique constraint and SELECT FOR UPDATE.",
    "I'm strongest in Go and PostgreSQL. I'm still growing in Kubernetes operations beyond deploying to it.",
    "Repeatable read gives snapshot isolation, so I retry serialization failures with jitter and keep handlers idempotent.",
    "Yes, how does the team run on-call and incident reviews?",
    "No, that's all, thank you for your time.",
    "Thanks, goodbye.",
];

interface CallResult {
    ok: boolean;
    error?: string;
    connectMs?: number;
    firstWordMs: number[];
    turnMs: number[];
    turns: number;
    ended: boolean;
}

async function metrics(): Promise<Record<string, number> | null> {
    if (!METRICS_TOKEN) return null;
    const response = await fetch(`${BASE}/metrics`, { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } });
    if (!response.ok) return null;
    const out: Record<string, number> = {};
    for (const line of (await response.text()).split("\n")) {
        const match = /^(process_cpu_seconds_total|process_resident_memory_bytes|ai_interviewer_active_interviews|nodejs_eventloop_lag_p99_seconds) ([\d.e+-]+)$/.exec(line);
        if (match) out[match[1]!] = Number(match[2]);
    }
    return out;
}

let connectedCount = 0;
let releaseHold: () => void = () => {};
const holdReleased = new Promise<void>((resolve) => { releaseHold = resolve; });
let steadyBefore: Record<string, number> | null = null;
let steadyAfter: Record<string, number> | null = null;
let steadyStartedAt = 0;
let steadyEndedAt = 0;

async function makeCandidate(index: number) {
    const user = await prisma.user.create({ data: { email: `load${Date.now()}-${index}@example.com`, password: "x", name: `Load ${index}` } });
    const role = "Backend Engineer";
    const plan = buildPlan({ role, level: "mid", format: "quick", analysis: fallbackAnalysis({ role, level: "mid" }), seed: `load-${index}` });
    const interview = await prisma.interview.create({ data: { userId: user.id, targetRole: role, level: "mid", format: "quick", durationMinutes: 20, planStatus: "READY", plan: plan as never } });
    return { token: signAccessToken({ id: user.id, email: user.email, name: user.name }), interviewId: interview.id };
}

async function runCall(index: number): Promise<CallResult> {
    const result: CallResult = { ok: false, firstWordMs: [], turnMs: [], turns: 0, ended: false };
    let pc: RTCPeerConnection | null = null;
    try {
        const { token, interviewId } = await makeCandidate(index);
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver("audio", { direction: "sendrecv" });
        const channel = pc.createDataChannel("ui-events");

        let editorKey: string | null = null;
        let approachSaid = false;
        let submitted = false;
        let lastSentAt = 0;
        let sawFirstWord = false;
        let interviewerSpoke: (() => void) | null = null;
        let ending: (() => void) | null = null;
        const endingPromise = new Promise<void>((resolve) => { ending = resolve; });
        channel.onMessage.subscribe((data: string | Buffer) => {
            let event: any;
            try { event = JSON.parse(String(data)); } catch { return; }
            if (process.env.DEBUG && index === 0 && event.type !== "STATE") console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${event.type}${event.role ? ` ${event.role}${event.final ? " final" : ""}` : ""}${event.message ? `: ${event.message}` : ""}${event.text ? `: ${String(event.text).slice(0, 70)}` : ""}`);
            if (event.type === "CAPTION" && event.role === "interviewer") {
                if (lastSentAt && !sawFirstWord) { result.firstWordMs.push(Date.now() - lastSentAt); sawFirstWord = true; }
                if (event.final) { if (lastSentAt) result.turnMs.push(Date.now() - lastSentAt); interviewerSpoke?.(); }
            }
            if (event.type === "SHOW_CODE_EDITOR" && event.mode === "code") { editorKey = event.problem.key; approachSaid = false; submitted = false; }
            if (event.type === "HIDE_CODE_EDITOR") editorKey = null;
            if (event.type === "ENDING") { result.ended = true; ending?.(); }
        });

        const started = Date.now();
        const t0 = started;
        await pc.setLocalDescription(await pc.createOffer());
        const response = await fetch(`${BASE}/api/webrtc/offer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: config.allowedOrigins[0]! },
            body: JSON.stringify({ sdp: pc.localDescription!.sdp, type: pc.localDescription!.type, interviewId }),
        });
        if (!response.ok) throw new Error(`offer ${response.status}: ${(await response.text()).slice(0, 120)}`);
        await pc.setRemoteDescription((await response.json()) as any);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("data channel did not open")), 20_000);
            if (channel.readyState === "open") { clearTimeout(timer); resolve(); return; }
            channel.stateChanged.subscribe((state: string) => { if (state === "open") { clearTimeout(timer); resolve(); } });
        });
        result.connectMs = Date.now() - started;
        connectedCount++;

        if (HOLD_SECONDS > 0) await holdReleased;
        // The interviewer speaks first. Then take turns until the interview ends.
        const nextInterviewerTurn = () => new Promise<void>((resolve) => { interviewerSpoke = resolve; });
        await Promise.race([nextInterviewerTurn(), new Promise((_, reject) => setTimeout(() => reject(new Error("interviewer never spoke")), 30_000))]);
        let spoken = 0;
        for (let i = 0; !result.ended && i < 40; i++) {
            const wait = nextInterviewerTurn();
            sawFirstWord = false;
            lastSentAt = Date.now();
            if (editorKey && approachSaid && !submitted && JS_SOLUTIONS[editorKey]) {
                // Working on a coding problem: hand in a correct solution, as a candidate who got it right would.
                submitted = true;
                channel.send(JSON.stringify({ type: "SUBMIT_CODE", problemKey: editorKey, language: "javascript", code: JS_SOLUTIONS[editorKey] }));
            } else if (editorKey && !approachSaid) {
                approachSaid = true;
                channel.send(JSON.stringify({ type: "USER_TEXT", text: "I'd use a hash map for constant-time lookups, so it's linear time and space. I'll handle empty input and duplicates. Let me code it." }));
            } else {
                channel.send(JSON.stringify({ type: "USER_TEXT", text: ANSWERS[Math.min(spoken++, ANSWERS.length - 1)] }));
            }
            result.turns++;
            await Promise.race([wait, endingPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("no reply within 30s")), 30_000))]);
            await new Promise((resolve) => setTimeout(resolve, 150)); // a person takes a breath; also lets the ENDING event arrive
        }
        result.ok = true;
    } catch (error) {
        result.error = (error as Error).message;
    } finally {
        try { await pc?.close(); } catch { /* already gone */ }
    }
    return result;
}

const percentile = (values: number[], p: number) => {
    if (values.length === 0) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

console.log(`Load test: ${CALLS} simultaneous interviews against ${BASE}`);
const before = await metrics();
const started = Date.now();
const running: Array<Promise<CallResult>> = [];
let peakActive = 0;
const sampler = setInterval(async () => { const m = await metrics(); if (m?.ai_interviewer_active_interviews) peakActive = Math.max(peakActive, m.ai_interviewer_active_interviews); }, 1000);
for (let i = 0; i < CALLS; i++) {
    running.push(runCall(i));
    await new Promise((resolve) => setTimeout(resolve, RAMP_MS));
}
if (HOLD_SECONDS > 0) {
    const deadline = Date.now() + 60_000;
    while (connectedCount < CALLS && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
    console.log(`${connectedCount}/${CALLS} calls connected; holding them open for ${HOLD_SECONDS}s to measure the steady-state cost...`);
    await new Promise((resolve) => setTimeout(resolve, 3_000)); // let the connections settle
    steadyBefore = await metrics();
    steadyStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, HOLD_SECONDS * 1000));
    steadyAfter = await metrics();
    steadyEndedAt = Date.now();
    releaseHold();
}
const results = await Promise.all(running);
clearInterval(sampler);
const wallSeconds = (Date.now() - started) / 1000;
const after = await metrics();

const good = results.filter((r) => r.ok && r.ended);
const failures = results.filter((r) => !r.ok || !r.ended);
const all = (pick: (r: CallResult) => number[]) => results.flatMap(pick);
console.log(`\ncompleted interviews: ${good.length}/${CALLS} in ${wallSeconds.toFixed(1)}s (peak simultaneous calls on the server: ${peakActive || "n/a"})`);
console.log(`connection setup (offer to open data channel): p50 ${percentile(results.map((r) => r.connectMs ?? NaN).filter(Number.isFinite), 50)}ms  p95 ${percentile(results.map((r) => r.connectMs ?? NaN).filter(Number.isFinite), 95)}ms`);
console.log(`answer to first interviewer word:  p50 ${percentile(all((r) => r.firstWordMs), 50)}ms  p95 ${percentile(all((r) => r.firstWordMs), 95)}ms  max ${Math.max(...all((r) => r.firstWordMs))}ms`);
console.log(`answer to finished reply:          p50 ${percentile(all((r) => r.turnMs), 50)}ms  p95 ${percentile(all((r) => r.turnMs), 95)}ms`);
if (before && after) {
    const cpu = after.process_cpu_seconds_total! - before.process_cpu_seconds_total!;
    console.log(`server CPU: ${cpu.toFixed(1)} CPU-seconds over ${wallSeconds.toFixed(1)}s wall = ${((cpu / wallSeconds) * 100).toFixed(0)}% of one core on average`);
    console.log(`server memory: ${(before.process_resident_memory_bytes! / 1e6).toFixed(0)} MB before, ${(after.process_resident_memory_bytes! / 1e6).toFixed(0)} MB after; event-loop lag p99 ${((after.nodejs_eventloop_lag_p99_seconds ?? 0) * 1000).toFixed(0)}ms`);
    const perCall = (cpu / Math.max(1, good.length));
    console.log(`≈ ${perCall.toFixed(2)} CPU-seconds per completed interview in this run`);
}
if (steadyBefore && steadyAfter) {
    const seconds = (steadyEndedAt - steadyStartedAt) / 1000;
    const cpu = steadyAfter.process_cpu_seconds_total! - steadyBefore.process_cpu_seconds_total!;
    console.log(`\nsteady state, ${connectedCount} calls open and idle for ${seconds.toFixed(0)}s: ${cpu.toFixed(2)} CPU-seconds = ${((cpu / seconds) * 100).toFixed(1)}% of one core, ${((cpu / seconds / connectedCount) * 100).toFixed(2)}% of a core per call`);
    console.log(`  event-loop lag p99 ${((steadyAfter.nodejs_eventloop_lag_p99_seconds ?? 0) * 1000).toFixed(0)}ms, memory ${(steadyAfter.process_resident_memory_bytes! / 1e6).toFixed(0)} MB`);
    console.log(`  → one core holds roughly ${Math.floor(100 / Math.max(0.01, (cpu / seconds / connectedCount) * 100))} such calls before it is fully busy (leave headroom: plan for about half)`);
}
if (failures.length > 0) {
    const reasons = new Map<string, number>();
    for (const f of failures) reasons.set(f.error ?? "did not reach the end", (reasons.get(f.error ?? "did not reach the end") ?? 0) + 1);
    console.log("\nfailures:");
    for (const [reason, count] of reasons) console.log(`  ${count} × ${reason}`);
}
await prisma.$disconnect();
process.exit(failures.length === 0 ? 0 : 1);
