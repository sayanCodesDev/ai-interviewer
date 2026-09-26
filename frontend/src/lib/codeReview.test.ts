import { expect, test } from "bun:test";
import { layoutReview, lineLabel, summariseNotes } from "./codeReview";
import type { CodeNote } from "./types";

const code = "def f(x):\n    total = 0\n    for i in x:\n        total += i\n    return total\n";

test("numbers the lines from one and ignores the trailing newline", () => {
    const { lines } = layoutReview(code);
    expect(lines.map((l) => l.number)).toEqual([1, 2, 3, 4, 5]);
    expect(lines[3]!.text).toBe("        total += i");
    expect(layoutReview("a\r\nb\r\n\r\n").lines.length).toBe(2);
    expect(layoutReview("").lines.length).toBe(0);
});

test("a note is shown under the last line it covers, and shades every line it covers", () => {
    const notes: CodeNote[] = [{ line: 3, endLine: 4, severity: "suggestion", comment: "Use sum()." }];
    const { lines, after } = layoutReview(code, notes);
    expect(after.get(4)?.length).toBe(1);
    expect(after.has(3)).toBe(false);
    expect(lines.map((l) => l.tone)).toEqual([undefined, undefined, "suggestion", "suggestion", undefined]);
});

test("where notes overlap the most serious one sets the shade, and notes on missing lines are dropped", () => {
    const notes: CodeNote[] = [
        { line: 2, endLine: 4, severity: "praise", comment: "Clear." },
        { line: 3, endLine: 3, severity: "issue", comment: "Off by one." },
        { line: 40, endLine: 41, severity: "issue", comment: "Not a real line." },
        { line: 0, endLine: 0, severity: "issue", comment: "Nor is this." },
    ];
    const { lines, after } = layoutReview(code, notes);
    expect(lines.map((l) => l.tone)).toEqual([undefined, "praise", "issue", "praise", undefined]);
    expect([...after.keys()].sort()).toEqual([3, 4]);
});

test("notes that share a last line are ordered by where they start", () => {
    const notes: CodeNote[] = [
        { line: 3, endLine: 4, severity: "suggestion", comment: "b" },
        { line: 4, endLine: 4, severity: "issue", comment: "c" },
        { line: 2, endLine: 4, severity: "praise", comment: "a" },
    ];
    expect(layoutReview(code, notes).after.get(4)!.map((n) => n.comment)).toEqual(["a", "b", "c"]);
});

test("labels and summaries read naturally", () => {
    expect(lineLabel({ line: 4, endLine: 4, severity: "praise", comment: "" })).toBe("line 4");
    expect(lineLabel({ line: 4, endLine: 6, severity: "praise", comment: "" })).toBe("lines 4 to 6");
    expect(summariseNotes([{ line: 1, endLine: 1, severity: "praise", comment: "" }, { line: 2, endLine: 2, severity: "suggestion", comment: "" }, { line: 3, endLine: 3, severity: "suggestion", comment: "" }, { line: 4, endLine: 4, severity: "issue", comment: "" }])).toBe("1 done well, 2 suggestions, 1 issue");
    expect(summariseNotes([])).toBe("");
});
