/**
 * Watches the interviewer's voice as it arrives, using the numbers the browser's own audio pipeline keeps.
 *
 * Two jobs. First, the level that animates the interviewer's tile: read from the connection's statistics, so the
 * voice is played by the browser's dedicated audio path alone. Routing the same stream through a Web Audio graph
 * as well, which the tile used to do, is a known way to get crackling and drift on some machines.
 * Second, how healthy the connection is: packets lost and the share of audio the browser had to invent to hide
 * gaps. A voice that glitches is the listener hearing exactly that, so it is measured, shown as "weak connection",
 * and reported to the server, where it can be counted and investigated.
 */
export interface CallQuality {
    level: "good" | "weak";
    lossPercent: number;
    concealedPercent: number;
    jitterMs: number;
}

export interface ClientStatsReport {
    lossPercent: number;
    concealedPercent: number;
    jitterMs: number;
    packets: number;
}

interface Inbound {
    audioLevel: number | undefined;
    packetsReceived: number;
    packetsLost: number;
    jitter: number;
    concealedSamples: number;
    totalSamplesReceived: number;
}

async function readInbound(pc: RTCPeerConnection): Promise<Inbound | null> {
    const stats = await pc.getStats();
    for (const report of stats.values()) {
        if (report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) {
            return {
                audioLevel: typeof report.audioLevel === "number" ? report.audioLevel : undefined,
                packetsReceived: report.packetsReceived ?? 0,
                packetsLost: Math.max(0, report.packetsLost ?? 0),
                jitter: report.jitter ?? 0,
                concealedSamples: report.concealedSamples ?? 0,
                totalSamplesReceived: report.totalSamplesReceived ?? 0,
            };
        }
    }
    return null;
}

/** Asks the browser to hold a little more incoming audio before playing it: 100 ms of extra latency buys smoothness on a jittery link. */
export function tuneReceiver(pc: RTCPeerConnection): void {
    for (const receiver of pc.getReceivers()) {
        if (receiver.track?.kind !== "audio") continue;
        try {
            (receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null }).jitterBufferTarget = 100;
        } catch {
            /* not supported in this browser: it keeps its own adaptive default */
        }
    }
}

const LEVEL_EVERY_MS = 100;
const REPORT_EVERY_MS = 5_000;
const MIN_PACKETS_TO_JUDGE = 100;

interface Handlers {
    /** The interviewer's loudness, 0 to 1. */
    onLevel: (level: number) => void;
    onQuality: (quality: CallQuality) => void;
    onReport: (report: ClientStatsReport) => void;
    /** Called once if this browser does not report an audio level, so the caller can fall back to another way of animating. */
    onNoLevel: () => void;
}

/** Starts monitoring; returns a function that stops it. */
export function monitorPlayback(pc: RTCPeerConnection, handlers: Handlers): () => void {
    let stopped = false;
    let sawLevel = false;
    let missedLevels = 0;
    let last: Inbound | null = null;
    let goodWindows = 0;
    let weak = false;

    const level = setInterval(async () => {
        if (stopped) return;
        try {
            const inbound = await readInbound(pc);
            if (stopped || !inbound) return;
            if (inbound.audioLevel === undefined) {
                if (!sawLevel && ++missedLevels === 15) handlers.onNoLevel();
                return;
            }
            sawLevel = true;
            // The reported level is a linear amplitude; speech sits low in it, so lift it for a lively tile.
            handlers.onLevel(Math.min(1, inbound.audioLevel * 2.6));
        } catch {
            /* the connection is closing */
        }
    }, LEVEL_EVERY_MS);

    const report = setInterval(async () => {
        if (stopped) return;
        try {
            const now = await readInbound(pc);
            if (stopped || !now) return;
            const before = last;
            last = now;
            if (!before) return;

            const packets = now.packetsReceived - before.packetsReceived;
            const lost = now.packetsLost - before.packetsLost;
            const samples = now.totalSamplesReceived - before.totalSamplesReceived;
            const concealed = now.concealedSamples - before.concealedSamples;
            if (packets + lost < MIN_PACKETS_TO_JUDGE || samples <= 0) return;

            const lossPercent = Math.max(0, (lost / (packets + lost)) * 100);
            const concealedPercent = Math.max(0, (concealed / samples) * 100);
            const jitterMs = now.jitter * 1000;

            // Quick to warn, slow to clear, so the notice does not flicker.
            const bad = lossPercent >= 5 || concealedPercent >= 8;
            goodWindows = bad ? 0 : goodWindows + 1;
            if (bad) weak = true;
            else if (weak && goodWindows >= 2) weak = false;

            handlers.onQuality({ level: weak ? "weak" : "good", lossPercent, concealedPercent, jitterMs });
            handlers.onReport({ lossPercent: round(lossPercent), concealedPercent: round(concealedPercent), jitterMs: round(jitterMs), packets: packets + lost });
        } catch {
            /* the connection is closing */
        }
    }, REPORT_EVERY_MS);

    return () => {
        stopped = true;
        clearInterval(level);
        clearInterval(report);
    };
}

const round = (value: number) => Math.round(value * 10) / 10;
