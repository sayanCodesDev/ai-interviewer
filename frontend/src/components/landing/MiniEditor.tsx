import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Kind = "kw" | "fn" | "plain";
type Token = readonly [Kind, string];

const KIND_CLASS: Record<Kind, string> = {
    kw: "text-signal",
    fn: "text-night-foreground",
    plain: "text-night-foreground/70",
};

const CODE_LINES: readonly (readonly Token[])[] = [
    [["kw", "def"], ["plain", " "], ["fn", "two_sum"], ["plain", "(nums, target):"]],
    [["plain", "    seen = {}"]],
    [["plain", "    "], ["kw", "for"], ["plain", " i, n "], ["kw", "in"], ["plain", " "], ["fn", "enumerate"], ["plain", "(nums):"]],
    [["plain", "        "], ["kw", "if"], ["plain", " target - n "], ["kw", "in"], ["plain", " seen:"]],
    [["plain", "            "], ["kw", "return"], ["plain", " [seen[target - n], i]"]],
    [["plain", "        seen[n] = i"]],
];

const LINE_LENGTHS = CODE_LINES.map((line) => line.reduce((total, [, text]) => total + text.length, 0));

// Each line is followed by a newline, which counts as one typed character.
export const CODE_LENGTH = LINE_LENGTHS.reduce((total, length) => total + length + 1, 0);

/** Reveals `total` characters one by one while `active`, and resets when it turns off. */
export function useTypewriter(total: number, active: boolean, charsPerSecond = 30) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!active) {
            setCount(0);
            return;
        }
        let current = 0;
        const id = setInterval(() => {
            current += 1;
            setCount(current);
            if (current >= total) clearInterval(id);
        }, 1000 / charsPerSecond);
        return () => clearInterval(id);
    }, [active, total, charsPerSecond]);

    return count;
}

interface MiniEditorProps {
    /** Characters typed so far. Omit to show all of the code. */
    count?: number;
    showCaret?: boolean;
    className?: string;
}

/** A picture of the code editor: line numbers, coloured tokens and an optional caret. */
export function MiniEditor({ count = CODE_LENGTH, showCaret = true, className }: MiniEditorProps) {
    let lineStart = 0;
    const rows = CODE_LINES.map((line, index) => {
        const start = lineStart;
        lineStart += LINE_LENGTHS[index]! + 1;
        return { line, index, started: count >= start, shown: Math.max(0, Math.min(LINE_LENGTHS[index]!, count - start)) };
    });
    const caretLine = rows.filter((row) => row.started).at(-1)?.index ?? 0;

    return (
        <pre className={cn("font-mono text-[12px] leading-[1.75] sm:text-[13px]", className)}>
            {rows.map((row) => {
                let budget = row.shown;
                const parts: React.ReactNode[] = [];
                for (const [kind, text] of row.line) {
                    if (budget <= 0) break;
                    parts.push(
                        <span key={parts.length} className={KIND_CLASS[kind]}>
                            {text.slice(0, budget)}
                        </span>,
                    );
                    budget -= text.length;
                }

                return (
                    <div key={row.index} className="flex min-h-[1.75em]">
                        <span className="w-7 shrink-0 text-night-muted/50 select-none">{row.started ? row.index + 1 : ""}</span>
                        <code className="whitespace-pre">
                            {parts}
                            {showCaret && row.index === caretLine && (
                                <span className="ml-px inline-block h-[1.15em] w-[2px] translate-y-[0.22em] animate-blink bg-signal" />
                            )}
                        </code>
                    </div>
                );
            })}
        </pre>
    );
}
