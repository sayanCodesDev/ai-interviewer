import { Check, PenLine } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { MiniEditor } from "@/components/landing/MiniEditor";
import { Sketch, WEBHOOK_DESIGN, WEBHOOK_VIEWBOX } from "@/components/landing/Sketch";
import { cn } from "@/lib/utils";

/** Pieces of the interview room, drawn in the fixed dark palette, shared by the hero's video and the How it works scenes. */

const HIDDEN_TESTS = 14;

/** The tests panel: the examples pass, then the hidden tests count up as they run. */
export function TestTicker({ running, className }: { running: boolean; className?: string }) {
    const reduce = useReducedMotion() ?? false;
    const [passed, setPassed] = useState(0);

    useEffect(() => {
        if (!running || reduce) {
            setPassed(running ? HIDDEN_TESTS : 0);
            return;
        }
        setPassed(0);
        let current = 0;
        const id = setInterval(() => {
            current += 1;
            setPassed(current);
            if (current >= HIDDEN_TESTS) clearInterval(id);
        }, 110);
        return () => clearInterval(id);
    }, [running, reduce]);

    const done = passed >= HIDDEN_TESTS;
    return (
        <div className={cn("grid gap-1.5 font-mono text-[12.5px] sm:text-[13.5px]", className)}>
            {["Example 1", "Example 2"].map((label) => (
                <p key={label} className="flex items-center gap-2">
                    <Check className={cn("size-3.5", running ? "text-signal" : "text-night-muted")} />
                    <span className="text-night-foreground/85">{label}</span>
                    <span className="ml-auto text-night-muted">{running ? "passed" : "—"}</span>
                </p>
            ))}
            <p className="flex items-center gap-2">
                <Check className={cn("size-3.5", done ? "text-signal" : "text-night-muted")} />
                <span className="text-night-foreground/85">Hidden tests</span>
                <span className={cn("ml-auto tabular-nums", done ? "text-signal" : "text-night-muted")}>
                    {passed}/{HIDDEN_TESTS}
                </span>
            </p>
        </div>
    );
}

export function EditorPane({ count, testing }: { count: number; testing: boolean }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-night-line bg-night-sunken">
            <div className="flex items-center justify-between gap-3 border-b border-night-line px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-3">
                    <span className="rounded-md border border-night-line px-2 py-1 text-[13px] text-night-muted">Python</span>
                    <span className="hidden font-mono text-[13px] text-night-muted sm:inline">two_sum.py</span>
                </div>
                <div className="flex items-center gap-2 text-[13px]">
                    <span className="rounded-md border border-night-line px-3 py-1.5 text-night-muted">Run</span>
                    <span
                        className={cn(
                            "rounded-md px-3 py-1.5 font-medium transition-colors duration-300",
                            testing ? "bg-signal text-signal-foreground" : "bg-signal/80 text-signal-foreground",
                        )}
                    >
                        Submit
                    </span>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-4">
                <MiniEditor count={count} />
            </div>
            <div className="border-t border-night-line px-3 py-3 sm:px-4">
                <p className="label-mono mb-2.5 text-night-muted">Tests</p>
                <TestTicker running={testing} />
            </div>
        </div>
    );
}

export function WhiteboardPane({ play, className }: { play: boolean; className?: string }) {
    return (
        <div className={cn("flex h-full flex-col overflow-hidden rounded-xl border border-night-line bg-[#1a1a17]", className)}>
            <div className="flex items-center justify-between gap-3 border-b border-night-line px-3 py-2.5 sm:px-4">
                <span className="flex items-center gap-2 text-[13px] text-night-muted">
                    <PenLine className="size-3.5" />
                    Whiteboard
                </span>
                <span className="label-mono hidden text-night-muted sm:inline">Share it and the interviewer reads it</span>
            </div>
            <div className="min-h-0 flex-1 p-3 text-night-foreground sm:p-5">
                <Sketch elements={WEBHOOK_DESIGN} viewBox={WEBHOOK_VIEWBOX} play={play} title="A whiteboard sketch of a webhook delivery system: an API, a queue, workers, Postgres and a Redis store for idempotency keys." />
            </div>
        </div>
    );
}

/** The system-design question beside the whiteboard, where the coding problem sits while coding. */
export function DesignCard({ visible }: { visible: boolean }) {
    return (
        <div className={cn("transition-opacity duration-500", visible ? "opacity-100" : "opacity-0")}>
            <div className="rounded-xl border border-night-line bg-night-raised p-4">
                <p className="label-mono text-night-muted">System design</p>
                <p className="mt-2 font-serif text-2xl tracking-tight">Webhook delivery at scale</p>
                <p className="mt-2 text-[14px] leading-relaxed text-night-muted">
                    A million events a day, delivered at least once, never processed twice. Clarify requirements, then sketch it.
                </p>
            </div>
        </div>
    );
}

export function ProblemCard({ visible }: { visible: boolean }) {
    return (
        <div
            className={cn(
                "grid min-h-0 transition-[grid-template-rows,opacity] duration-700 ease-out-expo",
                visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
        >
            <div className="min-h-0 overflow-hidden">
                <div className="rounded-xl border border-night-line bg-night-raised p-4">
                    <p className="label-mono text-night-muted">Problem 1 · Easy</p>
                    <p className="mt-2 font-serif text-2xl tracking-tight">Two Sum</p>
                    <p className="mt-2 text-[14px] leading-relaxed text-night-muted">
                        Given an array of integers and a target, return the indices of the two numbers that add up to the target.
                    </p>
                </div>
            </div>
        </div>
    );
}
