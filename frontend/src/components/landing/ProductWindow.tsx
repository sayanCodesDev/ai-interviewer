import { CodeXml } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { LogoMark } from "@/components/brand/Logo";
import { CODE_LENGTH, MiniEditor, useTypewriter } from "@/components/landing/MiniEditor";
import { formatClock } from "@/hooks/useElapsed";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { cn } from "@/lib/utils";

const PHASES = [
    { name: "ask", ms: 4200 },
    { name: "answer", ms: 3600 },
    { name: "problem", ms: 2800 },
    { name: "code", ms: 5800 },
    { name: "run", ms: 3200 },
] as const;

type Phase = (typeof PHASES)[number]["name"];

function useDemoPhase(active: boolean, frozen: boolean): Phase {
    const [index, setIndex] = useState(frozen ? 4 : 0);

    useEffect(() => {
        if (!active || frozen) return;
        const id = setTimeout(() => setIndex((current) => (current + 1) % PHASES.length), PHASES[index]!.ms);
        return () => clearTimeout(id);
    }, [active, frozen, index]);

    return PHASES[index]!.name;
}

export function EditorPane({ count, phase }: { count: number; phase: Phase }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-night-line bg-night-sunken">
            <div className="flex items-center justify-between gap-3 border-b border-night-line px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-3">
                    <span className="rounded-md border border-night-line px-2 py-1 text-xs text-night-muted">Python</span>
                    <span className="hidden font-mono text-xs text-night-muted sm:inline">02:31</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span
                        className={cn(
                            "rounded-md border px-3 py-1.5 transition-colors duration-300",
                            phase === "run" ? "border-night-foreground/40 bg-night-raised text-night-foreground" : "border-night-line text-night-muted",
                        )}
                    >
                        Run
                    </span>
                    <span className="rounded-md bg-signal px-3 py-1.5 font-medium text-signal-foreground">Submit</span>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-4">
                <MiniEditor count={count} />
            </div>
            <div className="border-t border-night-line px-3 py-3 sm:px-4">
                <p className="label-mono text-night-muted">Output</p>
                <p className="mt-2 h-4 font-mono text-xs text-night-foreground/80">
                    {phase === "run" ? "[0, 1]" : <span className="text-night-muted">Terminal ready.</span>}
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
                    <p className="label-mono text-night-muted">Problem 2</p>
                    <h3 className="mt-2 font-serif text-xl tracking-tight">Two Sum</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-night-muted">
                        Given an array of integers and a target, return the indices of the two numbers that add up to the target.
                    </p>
                </div>
            </div>
        </div>
    );
}

/** A living picture of the interview room: it talks, listens, opens the editor, and runs code on a loop. */
export function ProductWindow({ className }: { className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
    const reduceMotion = useReducedMotion() ?? false;
    const wide = useMediaQuery("(min-width: 768px)");

    const phase = useDemoPhase(inView, reduceMotion);
    const aiLevel = useSimulatedLevel(inView && (phase === "ask" || phase === "problem"), 1);
    const userLevel = useSimulatedLevel(inView && phase === "answer", 7);
    const split = phase === "problem" || phase === "code" || phase === "run";

    const typed = useTypewriter(CODE_LENGTH, phase === "code");
    const count = reduceMotion || phase === "run" ? CODE_LENGTH : typed;

    const [seconds, setSeconds] = useState(12 * 60 + 4);
    useEffect(() => {
        if (!inView || reduceMotion) return;
        const id = setInterval(() => setSeconds((current) => current + 1), 1000);
        return () => clearInterval(id);
    }, [inView, reduceMotion]);

    return (
        <div
            ref={ref}
            role="img"
            aria-label="The interview room: a voice conversation with the interviewer beside a live code editor."
            className={cn(
                "overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground shadow-[0_50px_100px_-40px_rgba(21,21,18,0.55)]",
                className,
            )}
        >
            <div className="flex h-12 items-center justify-between gap-3 border-b border-night-line px-4">
                <div className="flex items-center gap-2.5">
                    <LogoMark className="size-5" />
                    <span className="text-[13px] font-medium">Frontend Engineer</span>
                </div>
                <div className="label-mono flex items-center gap-2 text-night-muted">
                    <span className="size-1.5 animate-live rounded-full bg-signal" />
                    Live
                    <span className="text-night-foreground">{formatClock(seconds)}</span>
                </div>
                <div className="hidden items-center gap-2 rounded-md border border-night-line px-2.5 py-1.5 text-xs text-night-muted sm:flex">
                    <CodeXml className="size-3.5" />
                    Code editor
                </div>
            </div>

            <div
                className="grid h-[400px] gap-3 p-3 transition-[grid-template-columns] duration-700 ease-out-expo sm:h-[440px] lg:h-[500px]"
                style={{
                    gridTemplateColumns: split
                        ? wide
                            ? "minmax(0,0.42fr) minmax(0,1fr)"
                            : "minmax(0,0fr) minmax(0,1fr)"
                        : "minmax(0,1fr) minmax(0,0fr)",
                }}
            >
                <div
                    className="grid min-h-0 min-w-0 gap-3 overflow-hidden transition-[grid-template-rows] duration-700 ease-out-expo"
                    style={{ gridTemplateRows: split ? "minmax(0,0.32fr) minmax(0,0.68fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                >
                    <div className="grid min-h-0 grid-cols-2 gap-3">
                        <Tile kind="ai" label="Interviewer" level={aiLevel} compact={split} />
                        <Tile kind="user" label="You" level={userLevel} initials="AL" compact={split} />
                    </div>
                    <ProblemCard visible={split} />
                </div>

                <div
                    className={cn(
                        "min-h-0 min-w-0 overflow-hidden transition-opacity duration-500",
                        split ? "opacity-100 delay-300" : "opacity-0",
                    )}
                >
                    <EditorPane count={count} phase={phase} />
                </div>
            </div>
        </div>
    );
}
