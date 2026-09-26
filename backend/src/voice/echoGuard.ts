/**
 * On speakers, the interviewer's voice leaks into the microphone. The browser cancels most of it, but the
 * speech recogniser is sharp enough to transcribe what is left, and then two things go wrong: the interviewer
 * is cut off mid-sentence because it "heard the candidate speak", and the candidate's answer is recorded as
 * the interviewer's own words. To the listener that is a voice that stops and starts by itself.
 *
 * Echo is easy to recognise because it repeats what was just said. This remembers the last stretch of the
 * interviewer's speech and reports when a transcript is mostly a replay of it.
 */
const WINDOW_MS = 25_000;

/** Edit distance, for words the recogniser spells a little differently each time ("Thalia", "Talia", "Telia"). */
function distance(a: string, b: string): number {
    if (a === b) return 0;
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0]!;
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = row[j]!;
            row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return row[b.length]!;
}

/** Whether two heard words are the same word, allowing for how a recogniser spells and truncates. */
function alike(a: string, b: string): boolean {
    if (a === b) return true;
    const shorter = Math.min(a.length, b.length);
    if (shorter < 4) return false;
    // "interview" heard for "interviewer", "engineer" for "engineers".
    if (a.startsWith(b) || b.startsWith(a)) return true;
    return shorter >= 5 && distance(a, b) <= 2;
}

function words(text: string): string[] {
    return text.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/**
 * The fewest word edits (a word heard wrongly, dropped or added) that turn some stretch of `haystack` into `needle`.
 * A recogniser mangles some words of an echo and drops others ("Thalia, and I'll" becomes "Sally I'll"), so an
 * exact comparison would miss most echoes. This is the classic approximate-substring dynamic programme, over words.
 */
function editsToFind(haystack: string[], needle: string[]): number {
    const m = needle.length;
    let previous = Array.from({ length: m + 1 }, (_, i) => i); // column for "no haystack words used yet"
    let best = previous[m]!;
    for (const word of haystack) {
        const current = [0]; // a match may start anywhere in the haystack
        for (let i = 1; i <= m; i++) {
            current[i] = Math.min(
                previous[i]! + 1, // an extra haystack word inside the match
                current[i - 1]! + 1, // a needle word that was not there
                previous[i - 1]! + (alike(word, needle[i - 1]!) ? 0 : 1),
            );
        }
        best = Math.min(best, current[m]!);
        previous = current;
    }
    return best;
}

/** How many edits still count as "the same words": none for three words, one in four or five, two in six to eight, and so on. */
const allowedEdits = (length: number) => Math.floor(length * 0.34);

export class EchoGuard {
    private spoken: Array<{ at: number; words: string[] }> = [];

    constructor(private readonly now: () => number = Date.now) {}

    /** Remember something the interviewer just said (or is about to say). */
    noteSpoken(text: string): void {
        const list = words(text);
        if (list.length === 0) return;
        this.spoken.push({ at: this.now(), words: list });
        this.prune();
    }

    /** Forget everything, e.g. when the call restarts. */
    reset(): void {
        this.spoken = [];
    }

    /**
     * Whether this transcript is mostly the interviewer's own recent speech coming back through the microphone.
     * Text shorter than `minWords` is never judged; the default of three is for answers, two is for the first words of
     * speech that has only just begun (an exact repeat of two words just spoken is far more likely echo than a person).
     */
    isEcho(transcript: string, minWords = 3): boolean {
        this.prune();
        const heard = words(transcript);
        if (heard.length < minWords || heard.length < 2 || this.spoken.length === 0) return false;

        // Echo starts arriving a word or two at a time, and that is when the interviewer would be cut off by it, so even a
        // few words count if they are (nearly) a run of what was just said.
        const said = this.spoken.flatMap((s) => s.words);
        return editsToFind(said, heard) <= allowedEdits(heard.length);
    }

    private prune(): void {
        const cutoff = this.now() - WINDOW_MS;
        this.spoken = this.spoken.filter((s) => s.at >= cutoff);
    }
}
