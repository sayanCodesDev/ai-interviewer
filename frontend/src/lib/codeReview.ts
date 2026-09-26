import type { CodeNote } from "./types";

export type Tone = CodeNote["severity"];

export interface ReviewLine {
    /** Counted from 1. */
    number: number;
    text: string;
    /** The most serious note that covers this line, if any: it sets how the line is shaded. */
    tone?: Tone;
}

export interface ReviewLayout {
    lines: ReviewLine[];
    /** Notes are shown under the last line they cover, so the reader has seen all of the code a note is about. */
    after: Map<number, CodeNote[]>;
}

const WEIGHT: Record<Tone, number> = { praise: 1, suggestion: 2, issue: 3 };

/** Splits code into numbered lines and works out where each review note goes. Notes about lines that do not exist are dropped. */
export function layoutReview(code: string, notes: CodeNote[] = []): ReviewLayout {
    const text = code.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    const lines: ReviewLine[] = (text === "" ? [] : text.split("\n")).map((line, i) => ({ number: i + 1, text: line }));
    const after = new Map<number, CodeNote[]>();

    for (const note of notes) {
        if (note.line < 1 || note.line > lines.length) continue;
        const end = Math.min(lines.length, Math.max(note.line, note.endLine));
        for (let n = note.line; n <= end; n++) {
            const line = lines[n - 1]!;
            if (!line.tone || WEIGHT[note.severity] > WEIGHT[line.tone]) line.tone = note.severity;
        }
        after.set(end, [...(after.get(end) ?? []), { ...note, endLine: end }]);
    }
    for (const list of after.values()) list.sort((a, b) => a.line - b.line || WEIGHT[b.severity] - WEIGHT[a.severity]);
    return { lines, after };
}

/** "3 good, 2 suggestions, 1 issue" for the heading over a review. */
export function summariseNotes(notes: CodeNote[]): string {
    const count = (severity: Tone) => notes.filter((n) => n.severity === severity).length;
    const parts = [
        count("praise") ? `${count("praise")} done well` : "",
        count("suggestion") ? `${count("suggestion")} suggestion${count("suggestion") === 1 ? "" : "s"}` : "",
        count("issue") ? `${count("issue")} issue${count("issue") === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    return parts.join(", ");
}

/** "line 4" or "lines 4 to 6". */
export function lineLabel(note: CodeNote): string {
    return note.endLine > note.line ? `lines ${note.line} to ${note.endLine}` : `line ${note.line}`;
}
