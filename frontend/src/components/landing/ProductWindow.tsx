import { Check, CodeXml, PenLine, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { LogoMark } from "@/components/brand/Logo";
import { DEMO_AUDIO_MS } from "@/components/landing/demoAudio.generated";
import { DEMO, type DemoStep } from "@/components/landing/demoScript";
import { CODE_LENGTH, MiniEditor, useTypewriter } from "@/components/landing/MiniEditor";
import { Sketch, WEBHOOK_DESIGN, WEBHOOK_VIEWBOX } from "@/components/landing/Sketch";
import { formatClock } from "@/hooks/useElapsed";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTypedText } from "@/hooks/useSequence";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A spoken step lasts as long as its line takes to say, plus a breath before the next one. */
const GAP_MS = 750;
const stepMs = (step: DemoStep) => Math.max(step.minMs, step.speaker ? (DEMO_AUDIO_MS[step.id] ?? 4000) + GAP_MS : 0);
/** What reduced motion shows, standing still: the tests passing, with the code and the problem on screen. */
const FROZEN_STEP = DEMO.findIndex((step) => step.id === "tests");

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

/** What is being said, typed out at the pace it is spoken, so it keeps time with the audio when the sound is on. */
function Caption({ step, active }: { step: DemoStep; active: boolean }) {
    const spokenMs = DEMO_AUDIO_MS[step.id];
    const charsPerSecond = spokenMs ? Math.min(60, Math.max(14, step.text.length / (spokenMs / 1000))) : 1000;
    const typed = useTypedText(step.text, active, charsPerSecond);
    // At most three lines, anchored to the bottom like live subtitles: a long line scrolls up as it is spoken.
    return (
        <div className="flex max-h-[4.2em] min-h-[2.8em] flex-col justify-end overflow-hidden px-1 text-[13.5px] leading-snug sm:text-[15px]" aria-hidden>
            <p className="text-center text-night-foreground/85">
                {step.speaker && <span className="label-mono mr-2 text-night-muted">{step.speaker === "ai" ? "Interviewer" : "You"}</span>}
                {step.speaker ? typed : <span className="text-night-muted">{step.text}</span>}
            </p>
        </div>
    );
}

/**
 * The demo's sound. Nothing is downloaded until the visitor asks for it; then every clip is fetched up front, so the
 * lines follow each other without a gap, and the clip for the step on screen plays whenever the window is in view.
 */
function useDemoAudio(step: DemoStep, index: number, on: boolean, playing: boolean) {
    const clips = useRef(new Map<string, HTMLAudioElement>());

    useEffect(() => {
        if (!on) return;
        for (const s of DEMO) {
            if (!s.speaker || clips.current.has(s.id)) continue;
            const audio = new Audio(`/demo/${s.id}.mp3`);
            audio.preload = "auto";
            clips.current.set(s.id, audio);
        }
    }, [on]);

    useEffect(() => {
        if (!on || !playing || !step.speaker) return;
        const audio = clips.current.get(step.id);
        if (!audio) return;
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return () => audio.pause();
        // `index` too: the same line coming round again on the next loop plays again.
    }, [on, playing, step, index]);
}

/**
 * A living picture of the interview room, from joining the call to the goodbye: the introduction, a question about
 * the candidate's own project, a coding problem with its tests, a follow-up, a design sketched on the whiteboard and
 * the wrap-up. Muted by default; with the sound on it plays the real interviewer voice.
 */
export function ProductWindow({ className }: { className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
    const reduceMotion = useReducedMotion() ?? false;
    const wide = useMediaQuery("(min-width: 768px)");
    const [soundOn, setSoundOn] = useState(false);
    // Standing still under reduced motion, unless the visitor asked to hear it, which plays it through.
    const frozen = reduceMotion && !soundOn;
    const [index, setIndex] = useState(frozen ? FROZEN_STEP : 0);
    const step = DEMO[frozen ? FROZEN_STEP : index]!;

    useEffect(() => {
        if (!inView || frozen) return;
        const id = setTimeout(() => setIndex((current) => (current + 1) % DEMO.length), stepMs(DEMO[index]!));
        return () => clearTimeout(id);
    }, [inView, frozen, index]);

    useDemoAudio(step, index, soundOn, inView);

    const toggleSound = useCallback(() => {
        // Turning the sound on starts the interview from the beginning, so it is heard from the first word.
        if (!soundOn) setIndex(0);
        setSoundOn(!soundOn);
    }, [soundOn]);

    const talking = inView && !frozen;
    const aiLevel = useSimulatedLevel(talking && step.speaker === "ai", 1);
    const userLevel = useSimulatedLevel(talking && step.speaker === "user", 7);
    const split = step.view === "code" || step.view === "tests" || step.view === "design";
    const drawing = step.view === "design";
    const connecting = step.view === "connecting";

    const typed = useTypewriter(CODE_LENGTH, step.view === "code" && !frozen);
    const count = frozen || step.view === "tests" || step.view === "design" ? CODE_LENGTH : step.view === "code" ? typed : 0;

    // The clock jumps to where the interview is at each step, then runs.
    const [seconds, setSeconds] = useState(step.clock);
    useEffect(() => setSeconds(step.clock), [step]);
    useEffect(() => {
        if (!inView || frozen || connecting) return;
        const id = setInterval(() => setSeconds((current) => current + 1), 1000);
        return () => clearInterval(id);
    }, [inView, frozen, connecting]);

    return (
        <div ref={ref} className={cn("flex flex-col items-center", className)}>
            <div className="w-full overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground shadow-[0_50px_100px_-40px_rgba(21,21,18,0.55)]">
                <div className="flex h-12 items-center justify-between gap-3 border-b border-night-line px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <LogoMark className="size-5" />
                        <span className="truncate text-[14px] font-medium">Backend Engineer</span>
                    </div>
                    <div className="label-mono flex items-center gap-2 text-night-muted">
                        <span className={cn("size-1.5 rounded-full", connecting ? "bg-night-muted" : "animate-live bg-signal")} />
                        {connecting ? "Joining" : "Live"}
                        <span className="text-night-foreground">{formatClock(seconds)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-3 sm:min-w-[16rem]">
                        <span className="hidden items-center gap-2 text-[13px] text-night-muted md:flex">
                            {drawing ? <PenLine className="size-3.5" /> : <CodeXml className="size-3.5" />}
                            <AnimatePresence mode="wait" initial={false}>
                                <m.span
                                    key={step.round}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                                >
                                    {step.round}
                                </m.span>
                            </AnimatePresence>
                        </span>
                        <button
                            type="button"
                            onClick={toggleSound}
                            aria-pressed={soundOn}
                            aria-label={soundOn ? "Turn the example's sound off" : "Play the example interview with sound"}
                            className={cn(
                                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                                soundOn ? "border-signal/60 text-night-foreground" : "border-night-line text-night-muted hover:text-night-foreground",
                            )}
                        >
                            {soundOn ? <Volume2 className="size-3.5 text-signal" /> : <VolumeX className="size-3.5" />}
                            <span className="hidden sm:inline">{soundOn ? "Sound on" : "Sound off"}</span>
                        </button>
                    </div>
                </div>

                <div
                    role="img"
                    aria-label="The Intervyu interview room, from the start: the interviewer introduces itself and asks about the candidate's project, then a coding problem with hidden tests, a system design sketched on a whiteboard, and the wrap-up."
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
                            <Caption key={`${index}-${step.id}`} step={step} active={inView} />
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
                            <EditorPane count={count} testing={step.view === "tests"} />
                        </div>
                        <div className={cn("absolute inset-0 transition-opacity duration-500", drawing ? "opacity-100" : "pointer-events-none opacity-0")}>
                            <WhiteboardPane play={drawing && inView} />
                        </div>
                    </div>
                </div>
            </div>

            <p className="label-mono mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-muted-foreground">
                The interview room · an example session ·
                <button type="button" onClick={toggleSound} className="label-mono underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">
                    {soundOn ? "Mute it" : "Play it with sound"}
                </button>
            </p>
        </div>
    );
}
