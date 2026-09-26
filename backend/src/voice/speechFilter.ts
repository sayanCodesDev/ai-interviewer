export interface FilterOutput {
    /** Text that is safe to speak and show. */
    text: string;
    /** Control markers found in this chunk, e.g. "ADVANCE" from [[ADVANCE]], in order. */
    markers: string[];
}

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";
const MARKER_OPEN = "[[";
const MARKER_CLOSE = "]]";
/** Longest thing that could still turn out to be a marker; anything longer is plain text. */
const MAX_MARKER_LENGTH = 40;

/** How many characters at the end of `text` could be the start of `token`. */
function partialPrefixLength(text: string, token: string): number {
    const max = Math.min(text.length, token.length - 1);
    for (let length = max; length > 0; length--) {
        if (token.startsWith(text.slice(text.length - length).toLowerCase())) return length;
    }
    return 0;
}

/**
 * Sits between the model's raw token stream and everything that speaks or displays it. It removes
 * hidden reasoning (<think>...</think>) and lifts out control markers ([[ADVANCE]]), holding back
 * anything that might be the start of either until it can tell. Neither may ever reach the
 * candidate's ears, even when split across arbitrary chunk boundaries.
 */
export class SpeechStreamFilter {
    private buffer = "";
    private inThink = false;

    push(chunk: string): FilterOutput {
        this.buffer += chunk;
        return this.drain(false);
    }

    /** Call once the model has finished. Anything still held back is resolved. */
    end(): FilterOutput {
        return this.drain(true);
    }

    private drain(final: boolean): FilterOutput {
        let text = "";
        const markers: string[] = [];

        for (;;) {
            if (this.inThink) {
                const close = this.buffer.toLowerCase().indexOf(THINK_CLOSE);
                if (close >= 0) {
                    this.buffer = this.buffer.slice(close + THINK_CLOSE.length);
                    this.inThink = false;
                    continue;
                }
                // Still reasoning. Keep only a possible partial closing tag.
                const keep = final ? 0 : partialPrefixLength(this.buffer, THINK_CLOSE);
                this.buffer = keep > 0 ? this.buffer.slice(this.buffer.length - keep) : "";
                break;
            }

            const lower = this.buffer.toLowerCase();
            const thinkAt = lower.indexOf(THINK_OPEN);
            const markerAt = this.buffer.indexOf(MARKER_OPEN);

            if (thinkAt >= 0 && (markerAt < 0 || thinkAt < markerAt)) {
                text += this.buffer.slice(0, thinkAt);
                this.buffer = this.buffer.slice(thinkAt + THINK_OPEN.length);
                this.inThink = true;
                continue;
            }

            if (markerAt >= 0) {
                const closeAt = this.buffer.indexOf(MARKER_CLOSE, markerAt + MARKER_OPEN.length);
                if (closeAt >= 0 && closeAt - markerAt <= MAX_MARKER_LENGTH) {
                    text += this.buffer.slice(0, markerAt);
                    markers.push(this.buffer.slice(markerAt + MARKER_OPEN.length, closeAt).trim().toUpperCase());
                    this.buffer = this.buffer.slice(closeAt + MARKER_CLOSE.length);
                    continue;
                }
                if (!final && this.buffer.length - markerAt <= MAX_MARKER_LENGTH) {
                    // Might still become a marker; speak everything before it and wait.
                    text += this.buffer.slice(0, markerAt);
                    this.buffer = this.buffer.slice(markerAt);
                    break;
                }
                // Too long to be a marker: it was ordinary text that happened to start with "[[".
                text += this.buffer.slice(0, markerAt + MARKER_OPEN.length);
                this.buffer = this.buffer.slice(markerAt + MARKER_OPEN.length);
                continue;
            }

            if (final) {
                text += this.buffer;
                this.buffer = "";
                break;
            }
            const hold = Math.max(partialPrefixLength(this.buffer, THINK_OPEN), partialPrefixLength(this.buffer, MARKER_OPEN));
            text += this.buffer.slice(0, this.buffer.length - hold);
            this.buffer = hold > 0 ? this.buffer.slice(this.buffer.length - hold) : "";
            break;
        }

        return { text, markers };
    }
}
