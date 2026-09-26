/**
 * Decides when the candidate has finished talking.
 *
 * A fixed pause is a bad rule: too short and it cuts people off mid-thought, too long and every
 * answer feels slow. This waits briefly after a complete sentence and longer when the last words
 * clearly trail off ("and...", "so..."), so quick answers are answered quickly and thinking pauses
 * are respected.
 */

const FILLER_ONLY = /^(?:(?:um+|uh+|er+|ah+|hm+|hmm+|mm+|mhm|uh-huh|umm+)[\s,.!?…-]*)+$/i;
/** Acknowledgements that shouldn't interrupt the interviewer. */
const BACKCHANNEL = /^(?:(?:yeah|yes|yep|yup|okay|ok|right|sure|mhm|mm-hmm|uh-huh|got it|i see|alright|cool|great|nice|thanks|thank you|understood|makes sense)[\s,.!?…-]*)+$/i;
/** Words that mean the speaker is mid-sentence. */
const TRAILING_CUES = new Set([
    "and", "but", "so", "because", "or", "then", "like", "the", "a", "an", "to", "of", "with", "that", "which", "if", "when",
    "while", "as", "for", "in", "on", "at", "by", "is", "are", "was", "were", "i", "we", "you", "it", "my", "our", "their",
    "also", "plus", "basically", "actually", "maybe", "well",
]);

export const TURN_TIMING = {
    /**
     * After a full, punctuated sentence of some length. An interview answer is thought out as it is spoken, so a pause after a
     * sentence is usually a breath before the next one; cutting in there makes the interviewer answer half an answer.
     */
    complete: 1100,
    /** After a very short punctuated reply ("Yes.", "I think so."). */
    short: 1500,
    /** Ends without punctuation, or trails off. */
    unfinished: 2200,
    /** Ends on a connective that promises more. */
    trailing: 3000,
    /** A hard ceiling: never wait longer than this after the last words. */
    max: 3500,
} as const;

export function isFillerOnly(text: string): boolean {
    return FILLER_ONLY.test(text.trim());
}

export function isBackchannel(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.length > 0 && (BACKCHANNEL.test(trimmed) || FILLER_ONLY.test(trimmed));
}

/** Real speech worth interrupting the interviewer for: not "mm-hmm", and not a stray syllable. */
export function isInterruption(text: string): boolean {
    const trimmed = text.trim();
    if (isBackchannel(trimmed)) return false;
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length >= 2 || trimmed.length >= 10;
}

/** How long to wait, after the last words, before treating the answer as finished. */
export function computeWaitMs(utterance: string, speechFinal = false): number {
    const text = utterance.trim();
    if (!text) return TURN_TIMING.unfinished;

    const words = text.split(/\s+/);
    const lastWord = (words[words.length - 1] ?? "").replace(/[.,!?…;:]+$/, "").toLowerCase();
    const endsSentence = /[.!?…]["')\]]?$/.test(text);
    const endsWithComma = /[,;:]$/.test(text);

    let wait: number;
    // "...and" promises more; "...for that." is a finished thought that happens to end on a small word.
    if (endsWithComma || (!endsSentence && TRAILING_CUES.has(lastWord))) wait = TURN_TIMING.trailing;
    else if (endsSentence) wait = words.length >= 5 ? TURN_TIMING.complete : TURN_TIMING.short;
    else wait = TURN_TIMING.unfinished;

    // The speech recogniser heard a natural end of speech; trust it a little, but never for a trailing cue.
    if (speechFinal && wait !== TURN_TIMING.trailing) wait = Math.round(wait * 0.85);
    return Math.min(wait, TURN_TIMING.max);
}

export interface TranscriptEvent {
    text: string;
    isFinal: boolean;
    /** The recogniser's own end-of-speech signal. */
    speechFinal?: boolean;
}

export interface TurnTakerOptions {
    /** The candidate finished; here is everything they said. */
    onTurn: (text: string) => void;
    /** The candidate started saying something real. Used for barge-in. */
    onSpeech?: (interimText: string) => void;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

export class TurnTaker {
    private pending = "";
    private timer: unknown = null;
    private disposed = false;
    private readonly setTimer: (fn: () => void, ms: number) => unknown;
    private readonly clearTimer: (handle: unknown) => void;

    constructor(private readonly options: TurnTakerOptions) {
        this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
        this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
    }

    /** True while there is candidate speech not yet handed off as a turn. */
    get hasPending(): boolean {
        return this.pending.trim().length > 0 || this.timer !== null;
    }

    onTranscript(event: TranscriptEvent): void {
        if (this.disposed) return;
        const text = event.text.trim();
        if (!text) return;

        // Fresh speech means the candidate is still going, so any pending end-of-turn is off.
        this.cancelTimer();
        this.options.onSpeech?.(text);

        if (!event.isFinal) return;

        this.pending = `${this.pending} ${text}`.trim();
        // Only filler so far ("um..."): keep listening, don't hand this off as an answer.
        if (isFillerOnly(this.pending)) return;

        const wait = computeWaitMs(this.pending, event.speechFinal);
        this.timer = this.setTimer(() => {
            this.timer = null;
            this.flush();
        }, wait);
    }

    /** The recogniser reports the candidate has stopped (its UtteranceEnd event). */
    onUtteranceEnd(): void {
        if (this.disposed || !this.pending.trim() || isFillerOnly(this.pending)) return;
        this.cancelTimer();
        // Shorten to the "complete" wait: the recogniser is confident, but a trailing cue still gets its time.
        const wait = Math.min(computeWaitMs(this.pending, true), TURN_TIMING.complete + 300);
        this.timer = this.setTimer(() => {
            this.timer = null;
            this.flush();
        }, wait);
    }

    private flush(): void {
        const text = this.pending.trim();
        this.pending = "";
        if (text && !this.disposed) this.options.onTurn(text);
    }

    private cancelTimer(): void {
        if (this.timer !== null) {
            this.clearTimer(this.timer);
            this.timer = null;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.cancelTimer();
        this.pending = "";
    }
}
