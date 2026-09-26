import { AlertTriangle, Check, Lightbulb } from "lucide-react";
import { Fragment, useMemo } from "react";

import { layoutReview, lineLabel, summariseNotes, type Tone } from "@/lib/codeReview";
import type { CodeNote } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, { label: string; icon: typeof Check; line: string; note: string; badge: string }> = {
    praise: { label: "Done well", icon: Check, line: "border-l-signal bg-signal/10", note: "border-l-signal", badge: "text-signal" },
    suggestion: { label: "Suggestion", icon: Lightbulb, line: "border-l-night-muted bg-white/[0.05]", note: "border-l-night-muted", badge: "text-night-foreground" },
    issue: { label: "Issue", icon: AlertTriangle, line: "border-l-night-red bg-night-red/15", note: "border-l-night-red", badge: "text-night-red" },
};

/**
 * The candidate's final code with line numbers, and the review's notes set under the lines they are about, the way a colleague's
 * comments appear on a pull request. Long lines wrap rather than scroll sideways, so no code ever runs off the edge of the card.
 */
export function CodeReview({ code, notes = [] }: { code: string; notes?: CodeNote[] }) {
    const { lines, after } = useMemo(() => layoutReview(code, notes), [code, notes]);
    const summary = summariseNotes(notes);

    return (
        <div className="mt-3">
            {summary && <p className="mb-2 text-[13px] text-muted-foreground">{summary}</p>}
            <div role="group" tabIndex={0} aria-label="Your code, with review notes under the lines they are about" className="max-h-[40rem] overflow-y-auto rounded-lg border bg-night py-2 font-mono text-[12.5px] leading-relaxed text-night-foreground outline-none focus-visible:ring-4 focus-visible:ring-foreground/20 print:max-h-none print:overflow-visible">
                {lines.map((line) => (
                    <Fragment key={line.number}>
                        <div id={`code-line-${line.number}`} className={cn("grid grid-cols-[3rem_minmax(0,1fr)] border-l-2 border-transparent", line.tone && TONES[line.tone].line)}>
                            <span aria-hidden className="select-none pr-3 text-right text-night-muted">{line.number}</span>
                            <code className="whitespace-pre-wrap break-words pr-4">{line.text === "" ? " " : line.text}</code>
                        </div>
                        {after.get(line.number)?.map((note) => {
                            const tone = TONES[note.severity];
                            const Icon = tone.icon;
                            return (
                                <div key={`${note.line}-${note.comment}`} role="note" className={cn("my-1.5 ml-[3rem] mr-3 rounded-md border border-l-2 border-night-line bg-night-raised px-3 py-2 font-sans text-[13px] leading-snug", tone.note)}>
                                    <p className={cn("flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase", tone.badge)}>
                                        <Icon className="size-3.5" aria-hidden />
                                        {tone.label}
                                        <span className="font-normal text-night-muted normal-case">· {lineLabel(note)}</span>
                                    </p>
                                    <p className="mt-1 text-night-foreground">{note.comment}</p>
                                </div>
                            );
                        })}
                    </Fragment>
                ))}
            </div>
        </div>
    );
}
