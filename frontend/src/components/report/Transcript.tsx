import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatOffset } from "@/lib/format";
import type { TranscriptEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TranscriptProps {
    entries: TranscriptEntry[];
    rounds: Array<{ key: string; title: string }>;
    /** A line to highlight, set when the reader follows an evidence link. */
    highlight: number | null;
}

/** The complete conversation with timestamps and section headings, searchable. */
export function Transcript({ entries, rounds, highlight }: TranscriptProps) {
    const [query, setQuery] = useState("");
    const [hideSession, setHideSession] = useState(false);
    const needle = query.trim().toLowerCase();

    const visible = useMemo(
        () => entries.filter((e) => (!hideSession || e.role !== "system") && (!needle || e.text.toLowerCase().includes(needle))),
        [entries, needle, hideSession],
    );

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 print:hidden">
                <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="search" aria-label="Search the transcript" placeholder="Search the transcript" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-9" />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={hideSession} onChange={(e) => setHideSession(e.target.checked)} className="size-4 accent-foreground" />
                    Hide session notes
                </label>
                {needle && <span className="text-sm text-muted-foreground">{visible.length} match{visible.length === 1 ? "" : "es"}</span>}
            </div>

            <ol className="mt-6 grid gap-1">
                {visible.map((entry) => {
                    if (entry.role === "system") {
                        return (
                            <li key={entry.seq} id={`t-${entry.seq}`} className="mt-5 border-t pt-3 first:mt-0 first:border-0 first:pt-0">
                                <p className="label-mono text-muted-foreground">
                                    <span className="tabular-nums">{formatOffset(entry.offsetMs)}</span> · {entry.text}
                                </p>
                            </li>
                        );
                    }
                    const isYou = entry.role === "candidate";
                    return (
                        <li
                            key={entry.seq}
                            id={`t-${entry.seq}`}
                            className={cn("grid grid-cols-[3.25rem_5.5rem_1fr] gap-x-3 rounded-md px-2 py-2 text-[15px] leading-relaxed transition-colors duration-700 sm:grid-cols-[3.5rem_6rem_1fr]", highlight === entry.seq && "bg-signal/40")}
                        >
                            <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{formatOffset(entry.offsetMs)}</span>
                            <span className={cn("pt-0.5 text-xs font-medium", isYou ? "text-foreground" : "text-muted-foreground")}>{isYou ? "You" : "Interviewer"}</span>
                            <span className={cn(isYou ? "text-foreground" : "text-muted-foreground")}>
                                {entry.text}
                                {entry.interrupted && <span className="ml-2 text-xs italic text-muted-foreground">(cut off)</span>}
                            </span>
                        </li>
                    );
                })}
                {visible.length === 0 && <li className="text-sm text-muted-foreground">Nothing matches that search.</li>}
            </ol>
        </div>
    );
}
