/**
 * Text-to-speech sounds far better fed whole sentences than one token at a time: prosody depends on
 * knowing where the sentence ends. This buffers the model's stream and releases complete sentences,
 * so the first one can be spoken while the rest is still being generated.
 */

const ABBREVIATIONS = new Set(["e.g.", "i.e.", "vs.", "etc.", "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "approx.", "fig."]);
const MAX_SENTENCE_CHARS = 240;

/** The interview is spoken, so markdown must reach neither the voice nor the captions. */
export function stripMarkdown(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*[-*•]\s+/gm, "")
        .replace(/^\s*\d+[.)]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim();
}

function endsWithAbbreviation(sentence: string): boolean {
    const lastWord = sentence.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    if (ABBREVIATIONS.has(lastWord)) return true;
    // A single capital letter and a dot is an initial ("J. Smith"), not the end of a sentence.
    return /^[A-Z]\.$/.test(sentence.trim().split(/\s+/).pop() ?? "");
}

export class SentenceChunker {
    private buffer = "";

    /** Feed more streamed text; returns any sentences that are now complete. */
    push(text: string): string[] {
        this.buffer += text;
        return this.extract(false);
    }

    /** The stream has ended: release whatever is left, finished or not. */
    flush(): string[] {
        return this.extract(true);
    }

    private extract(final: boolean): string[] {
        const out: string[] = [];

        for (;;) {
            const boundary = this.findBoundary(final);
            if (boundary < 0) break;
            const raw = this.buffer.slice(0, boundary);
            this.buffer = this.buffer.slice(boundary);
            const clean = stripMarkdown(raw);
            if (clean) out.push(clean);
        }

        if (final) {
            const clean = stripMarkdown(this.buffer);
            this.buffer = "";
            if (clean) out.push(clean);
        }
        return out;
    }

    /** Index just past the next sentence end, or -1 when the buffer holds no finished sentence yet. */
    private findBoundary(final: boolean): number {
        const text = this.buffer;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i]!;

            if (ch === "\n") {
                // A blank line or list break ends a sentence, but a lone wrap inside a sentence should not.
                if (text[i + 1] === "\n" || /^\s*([-*•]|\d+[.)])\s/.test(text.slice(i + 1, i + 6))) return i + 1;
                continue;
            }
            if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;

            // Swallow a run like "?!" or "..." and any closing quote/bracket.
            let end = i + 1;
            while (end < text.length && /[.!?…"')\]]/.test(text[end]!)) end++;

            // Only a sentence end if whitespace follows; otherwise it's "3.5", "main.py" or a chunk still arriving.
            if (end >= text.length) {
                if (final) return end;
                return -1;
            }
            if (!/\s/.test(text[end]!)) {
                i = end - 1;
                continue;
            }
            if (ch === "." && endsWithAbbreviation(text.slice(0, end))) {
                i = end - 1;
                continue;
            }
            return end;
        }

        // A very long run with no punctuation would delay speech; cut it at a natural pause.
        if (text.length > MAX_SENTENCE_CHARS) {
            const window = text.slice(0, MAX_SENTENCE_CHARS);
            const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" — "), window.lastIndexOf(" "));
            if (cut > 40) return cut + 1;
        }
        return -1;
    }
}
