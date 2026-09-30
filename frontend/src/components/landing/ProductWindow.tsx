import { Check, CodeXml, PenLine } from "lucide-react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { LogoMark } from "@/components/brand/Logo";
import { CODE_LENGTH, MiniEditor, useTypewriter } from "@/components/landing/MiniEditor";
import { Sketch, WEBHOOK_DESIGN, WEBHOOK_VIEWBOX } from "@/components/landing/Sketch";
import { formatClock } from "@/hooks/useElapsed";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTypedText } from "@/hooks/useSequence";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PHASES = [
    { name: "ask", ms: 4600 },
    { name: "answer", ms: 4200 },
    { name: "problem", ms: 3400 },
    { name: "code", ms: 5600 },
    { name: "tests", ms: 3800 },
    { name: "design", ms: 7200 },
] as const;

export type Phase = (typeof PHASES)[number]["name"];

/** What each side says in each phase, so the loop reads as a real exchange rather than an animation. */
const SCRIPT: Record<Phase, { role: "ai" | "user"; text: string }> = {
    ask: { role: "ai", text: "I saw the webhook service on your GitHub. How did you make retries safe?" },
    answer: { role: "user", text: "Every event carries an idempotency key, so a repeated delivery is a no-op." },
    problem: { role: "ai", text: "Nice. Let's code one: return the two indices that add up to a target." },
    code: { role: "user", text: "I'll keep a map of what I've seen, so it's a single pass." },
    tests: { role: "ai", text: "All fourteen hidden tests passed. What's the time complexity?" },
    design: { role: "ai", text: "Last part: sketch how you'd deliver a million webhooks a day." },
};

const ROUND: Record<Phase, string> = {
    ask: "Round 2 of 6 · Background",
    answer: "Round 2 of 6 · Background",
    problem: "Round 3 of 6 · Coding",
    code: "Round 3 of 6 · Coding",
    tests: "Round 3 of 6 · Coding",
    design: "Round 5 of 6 · System design",
};

function useDemoPhase(active: boolean, frozen: boolean): Phase {
    const [index, setIndex] = useState(frozen ? 4 : 0);

    useEffect(() => {
        if (!active || frozen) return;
        const id = setTimeout(() => setIndex((current) => (current + 1) % PHASES.length), PHASES[index]!.ms);
        return () => clearTimeout(id);
    }, [active, frozen, index]);

    return PHASES[index]!.name;
}

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

export function EditorPane({ count, phase }: { count: number; phase: Phase }) {
    const testing = phase === "tests";
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

function Caption({ phase, active }: { phase: Phase; active: boolean }) {
    const line = SCRIPT[phase];
    const typed = useTypedText(line.text, active, 46);
    return (
        <p className="min-h-[2.8em] px-1 text-center text-[13.5px] leading-snug text-night-foreground/85 sm:text-[15px]" aria-hidden>
            <span className="label-mono mr-2 text-night-muted">{line.role === "ai" ? "Interviewer" : "You"}</span>
            {typed}
        </p>
    );
}

/** A living picture of the interview room: it talks, listens, opens the editor, runs the tests and sketches a design, on a loop. */
export function ProductWindow({ className }: { className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
    const reduceMotion = useReducedMotion() ?? false;
    const wide = useMediaQuery("(min-width: 768px)");

    const phase = useDemoPhase(inView, reduceMotion);
    const aiLevel = useSimulatedLevel(inView && SCRIPT[phase].role === "ai", 1);
    const userLevel = useSimulatedLevel(inView && SCRIPT[phase].role === "user", 7);
    const split = phase !== "ask" && phase !== "answer";
    const drawing = phase === "design";

    const typed = useTypewriter(CODE_LENGTH, phase === "code");
    const count = reduceMotion || phase === "tests" || phase === "design" ? CODE_LENGTH : phase === "code" ? typed : 0;

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
            aria-label="The Intervyu interview room: a spoken conversation with the AI interviewer beside a live code editor with tests, and a whiteboard for system design."
            className={cn("overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground shadow-[0_50px_100px_-40px_rgba(21,21,18,0.55)]", className)}
        >
            <div className="flex h-12 items-center justify-between gap-3 border-b border-night-line px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <LogoMark className="size-5" />
                    <span className="truncate text-[14px] font-medium">Backend Engineer</span>
                </div>
                <div className="label-mono flex items-center gap-2 text-night-muted">
                    <span className="size-1.5 animate-live rounded-full bg-signal" />
                    Live
                    <span className="text-night-foreground">{formatClock(seconds)}</span>
                </div>
                <div className="hidden min-w-[13.5rem] items-center justify-end gap-2 text-[13px] text-night-muted sm:flex">
                    {drawing ? <PenLine className="size-3.5" /> : <CodeXml className="size-3.5" />}
                    <AnimatePresence mode="wait" initial={false}>
                        <m.span
                            key={ROUND[phase]}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                        >
                            {ROUND[phase]}
                        </m.span>
                    </AnimatePresence>
                </div>
            </div>

            <div
                className="grid h-[430px] gap-3 p-3 transition-[grid-template-columns] duration-700 ease-out-expo sm:h-[470px] lg:h-[520px]"
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
                    style={{ gridTemplateRows: split ? "minmax(0,0.4fr) minmax(0,0.6fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                >
                    <div className="grid min-h-0 grid-rows-[1fr_auto] gap-2">
                        <div className="grid min-h-0 grid-cols-2 gap-3">
                            <Tile kind="ai" label="Interviewer" level={aiLevel} compact={split} />
                            <Tile kind="user" label="You" level={userLevel} initials="AL" compact={split} />
                        </div>
                        <Caption phase={phase} active={inView} />
                    </div>
                    <div className="relative min-h-0">
                        <div className={cn("transition-opacity duration-500", drawing && "opacity-0")}>
                            <ProblemCard visible={split} />
                        </div>
                        <div className="absolute inset-x-0 top-0">
                            <DesignCard visible={drawing} />
                        </div>
                    </div>
                </div>

                <div className={cn("relative min-h-0 min-w-0 overflow-hidden transition-opacity duration-500", split ? "opacity-100 delay-300" : "opacity-0")}>
                    <div className={cn("absolute inset-0 transition-opacity duration-500", drawing ? "pointer-events-none opacity-0" : "opacity-100")}>
                        <EditorPane count={count} phase={phase} />
                    </div>
                    <div className={cn("absolute inset-0 transition-opacity duration-500", drawing ? "opacity-100" : "pointer-events-none opacity-0")}>
                        <WhiteboardPane play={drawing && inView} />
                    </div>
                </div>
            </div>
        </div>
    );
}
