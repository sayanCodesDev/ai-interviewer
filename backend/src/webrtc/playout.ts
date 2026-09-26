import type { PcmFrameQueue } from "../services/audioQueue";

/**
 * Decides, every 20 ms, whether the interviewer's next word goes out or the line stays quiet.
 *
 * Speech synthesis does not deliver audio at a steady pace. The first second arrives slower than real time,
 * the network can stall for a moment, and between two sentences the language model may still be writing the
 * next one. If every arriving chunk were played the instant it landed, each hiccup would become a hole in
 * the middle of a word: the choppy, glitching voice. Real audio players hide this with a buffer:
 *
 *   - Hold the start of a reply until a little audio is queued (the pre-roll), so playback never catches up
 *     with a slow start.
 *   - If it does run dry mid-reply, stop cleanly and resume only once a small amount is queued again, so one
 *     late chunk becomes one short pause, not a stutter.
 *   - Once the synthesiser says it has nothing more, play out whatever is left, including the partial last frame.
 *
 * The pacer sends silence whenever this returns null, so the RTP clock never stops.
 */
export interface PlayoutConfig {
    /** Audio to hold before the first word of a reply is played, at the least. */
    preRollMs: number;
    /** Audio to hold before resuming after running dry in the middle of a reply, at the least. */
    resumeMs: number;
    /** Never keep audio waiting longer than this for the buffer to fill. */
    maxWaitMs: number;
    /** If more audio is expected but none has arrived for this long, stop waiting for it. */
    stallGiveUpMs: number;
    /**
     * When the synthesiser is slower than real time, a small buffer only turns one long stutter into many short
     * ones. The buffer is instead sized so playback can run to the end of the text without catching up, but never
     * beyond this: past it, the reply is played in stretches with honest pauses.
     */
    maxLeadMs: number;
    /** How far back the delivery speed is measured. */
    rateWindowMs: number;
}

export const DEFAULT_PLAYOUT: PlayoutConfig = {
    preRollMs: 450,
    resumeMs: 500,
    maxWaitMs: 4000,
    stallGiveUpMs: 6000,
    maxLeadMs: 4000,
    rateWindowMs: 600,
};

export interface PlayoutEvents {
    /** A reply started playing, after being held back this many milliseconds to build the pre-roll. */
    onStart?: (waitedMs: number) => void;
    /** Speech ran dry in the middle of a reply and resumed after this many milliseconds. */
    onGap?: (gapMs: number) => void;
}

type Phase = "idle" | "buffering" | "playing";

export class SpeechPlayout {
    private phase: Phase = "idle";
    private more = false;
    private bufferingSince = 0;
    private gapStartedAt = 0;
    private afterGap = false;
    private lastActivityAt = 0;
    /** Audio the text sent so far is expected to make, and how much has arrived, in milliseconds of speech. */
    private expectedMs = 0;
    private receivedMs = 0;
    /** Recent arrivals, for measuring how fast the synthesiser is delivering. */
    private arrivals: Array<{ at: number; ms: number }> = [];

    constructor(
        private readonly queue: PcmFrameQueue,
        private readonly config: PlayoutConfig = DEFAULT_PLAYOUT,
        private readonly events: PlayoutEvents = {},
        private readonly now: () => number = Date.now,
    ) {}

    get state(): Phase {
        return this.phase;
    }

    /** Audio waiting to be heard, including what is being held back for the pre-roll. */
    get queuedMs(): number {
        return this.queue.durationMs;
    }

    /**
     * About how much speech a piece of text will make (the caller estimates from its length). Lets the buffer be sized
     * to the work still to come rather than to a fixed guess.
     */
    expectAudio(ms: number): void {
        this.expectedMs += Math.max(0, ms);
    }

    /** A chunk of mono 16-bit 48 kHz speech from the synthesiser. */
    enqueue(mono: Buffer): void {
        this.queue.enqueueMono(mono);
        const chunkMs = mono.length / 2 / 48;
        this.receivedMs += chunkMs;
        this.arrivals.push({ at: this.now(), ms: chunkMs });
        this.lastActivityAt = this.now();
        if (this.phase === "idle") {
            this.phase = "buffering";
            this.bufferingSince = this.now();
            this.afterGap = false;
        }
    }

    /** Whether the synthesiser still has audio coming for the reply being spoken. */
    expectMore(more: boolean): void {
        this.more = more;
        this.lastActivityAt = this.now();
        if (!more) this.expectedMs = this.receivedMs; // it is finished: what arrived is all there is
    }

    /** Drops everything (barge-in) and goes quiet. */
    clear(): void {
        this.queue.reset();
        this.more = false;
        this.phase = "idle";
        this.afterGap = false;
        this.expectedMs = 0;
        this.receivedMs = 0;
        this.arrivals = [];
    }

    /**
     * How much audio must be queued before playing can safely start (or resume). Playing is safe once the queue holds
     * enough that, at the speed audio is currently arriving, it will not run out before the rest of the text has come.
     * At real-time speed or faster that is just the floor; the slower the delivery, the more is needed.
     */
    private neededMs(floor: number): number {
        const t = this.now();
        const from = t - this.config.rateWindowMs;
        this.arrivals = this.arrivals.filter((a) => a.at >= from);
        if (this.arrivals.length < 2) return floor;

        const span = Math.max(100, t - this.arrivals[0]!.at);
        const inWindow = this.arrivals.reduce((sum, a) => sum + a.ms, 0) - this.arrivals[0]!.ms;
        const rate = inWindow / span; // milliseconds of speech delivered per millisecond
        if (rate >= 1.15) return floor;

        const remaining = Math.max(0, this.expectedMs - this.receivedMs);
        const shortfall = ((1 - Math.min(rate, 1)) * remaining) / Math.max(rate, 0.15);
        return Math.min(Math.max(floor, this.config.maxLeadMs), floor + shortfall);
    }

    /** The next 20 ms frame to send, or null to send silence. */
    next(): Buffer | null {
        const t = this.now();

        if (this.phase === "idle") return null;

        if (this.phase === "buffering") {
            const have = this.queue.durationMs;
            if (have <= 0 && !this.more) {
                this.phase = "idle";
                return null;
            }
            const needed = this.neededMs(this.afterGap ? this.config.resumeMs : this.config.preRollMs);
            const waited = t - this.bufferingSince;
            const ready = have >= needed || (!this.more && have > 0) || (waited >= this.config.maxWaitMs && have > 0);
            if (!ready) {
                // Waiting on audio that never comes: don't hold the line open forever.
                if (have <= 0 && this.more && t - this.lastActivityAt > this.config.stallGiveUpMs) {
                    this.more = false;
                    this.phase = "idle";
                }
                return null;
            }
            this.phase = "playing";
            if (this.afterGap) this.events.onGap?.(t - this.gapStartedAt);
            else this.events.onStart?.(waited);
            this.afterGap = false;
        }

        // Playing.
        const frame = this.queue.readFrame(false);
        if (frame) return frame;

        if (!this.more) {
            // The reply is over: play the partial last frame, then go quiet.
            const tail = this.queue.readFrame(true);
            this.phase = "idle";
            return tail;
        }
        // Ran dry while more is still coming: pause cleanly and resume once a little is queued again.
        this.phase = "buffering";
        this.afterGap = true;
        this.gapStartedAt = t;
        this.bufferingSince = t;
        return null;
    }
}
