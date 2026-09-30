import { Check, ChevronDown, FileText, Loader2 } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { GithubMark } from "@/components/brand/GithubMark";
import { CODE_LENGTH, useTypewriter } from "@/components/landing/MiniEditor";
import { EditorPane, ProblemCard, WhiteboardPane } from "@/components/landing/roomParts";
import { FORMAT_CONTENT } from "@/content/roles.generated";
import { useSequence, useTypedText } from "@/hooks/useSequence";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Animated pictures of each stage of an interview, drawn in the fixed dark palette. Each plays while `active`
 * (the step on screen) and rests on its finished state under reduced motion.
 */
export interface SceneProps {
    active: boolean;
}

const LEVELS = ["Intern", "Junior", "Mid", "Senior", "Staff"];
const STANDARD = FORMAT_CONTENT.find((f) => f.id === "standard")!;

/** Round colours for the format timelines: coding in the accent, everything else in shades of the night palette. */
export function roundTone(type: string): string {
    if (type === "coding") return "bg-signal";
    if (type === "system_design") return "bg-night-amber";
    if (type === "technical") return "bg-night-foreground/70";
    if (type === "intro" || type === "wrapup") return "bg-night-foreground/25";
    return "bg-night-foreground/45";
}

const SETUP_STEPS = [700, 900, 900, 2900, 700, 1000, 1500, 99_000] as const;
const JD =
    "We're hiring a backend engineer to own our payments API: Postgres, Kafka and idempotent webhooks at scale, with on-call one week in four.";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[13.5px] font-medium text-night-foreground/90">{label}</p>
            <div className="mt-1.5">{children}</div>
        </div>
    );
}

export function SetupScene({ active }: SceneProps) {
    const step = useSequence(SETUP_STEPS, active);
    const jd = useTypedText(JD, active && step >= 3, 70);

    return (
        <div className="flex h-full flex-col gap-3 overflow-hidden p-4 sm:gap-4 sm:p-7">
            <p className="label-mono text-night-muted">Interview setup</p>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Field label="Target role">
                    <div className="flex h-10 items-center justify-between rounded-md border border-night-line bg-night-raised px-3 text-[14.5px]">
                        {step >= 1 ? "Backend Engineer" : <span className="text-night-muted">Choose a role</span>}
                        <ChevronDown className="size-4 text-night-muted" />
                    </div>
                </Field>
                <Field label="Your level">
                    <div className="grid h-10 grid-cols-5 gap-1 rounded-md border border-night-line bg-night-raised p-1 text-[12.5px]">
                        {LEVELS.map((level, index) => (
                            <span
                                key={level}
                                className={cn(
                                    "flex items-center justify-center rounded-[5px] transition-colors duration-300",
                                    step >= 2 && index === 2 ? "bg-night-foreground text-night" : "text-night-muted",
                                )}
                            >
                                {level}
                            </span>
                        ))}
                    </div>
                </Field>
            </div>

            <Field label="Format">
                <div className="rounded-md border border-night-line bg-night-raised px-3 py-2.5">
                    <div className="flex items-baseline justify-between text-[14.5px]">
                        {step >= 2 ? <span>{STANDARD.label}</span> : <span className="text-night-muted">Pick a level first</span>}
                        {step >= 2 && (
                            <span className="font-mono text-[12.5px] text-night-muted">
                                {STANDARD.minutes} min<span className="hidden sm:inline"> · suggested for your level</span>
                            </span>
                        )}
                    </div>
                    <div className="mt-2.5 flex h-1.5 gap-1 overflow-hidden rounded-full">
                        {STANDARD.rounds.map((round, index) => (
                            <m.span
                                key={round.type}
                                className={cn("h-full origin-left rounded-full", roundTone(round.type))}
                                style={{ flexGrow: round.minutes }}
                                initial={false}
                                animate={{ scaleX: step >= 2 ? 1 : 0 }}
                                transition={{ duration: 0.5, ease: EASE_OUT_EXPO, delay: index * 0.06 }}
                            />
                        ))}
                    </div>
                </div>
            </Field>

            <Field label="Job description">
                <div className="h-[4.9rem] overflow-hidden rounded-md border border-night-line bg-night-raised px-3 py-2 text-[13.5px] leading-relaxed text-night-foreground/85">
                    {jd}
                    {step === 3 && <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-blink bg-signal" />}
                    {step < 3 && <span className="text-night-muted">Paste the role's description…</span>}
                </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-night-line bg-night-raised px-3 text-[13.5px]">
                    <FileText className="size-4 shrink-0 text-night-muted" />
                    {step >= 4 ? <span className="truncate">resume.pdf</span> : <span className="truncate text-night-muted">Resume</span>}
                    {step >= 4 && <Check className="ml-auto size-4 shrink-0 text-signal" />}
                </div>
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-night-line bg-night-raised px-3 text-[13.5px]">
                    <GithubMark className="size-4 shrink-0 text-night-muted" />
                    {step >= 5 ? <span className="truncate">github.com/ada-lovelace</span> : <span className="truncate text-night-muted">GitHub</span>}
                    {step >= 5 && <Check className="ml-auto size-4 shrink-0 text-signal" />}
                </div>
            </div>

            <div className="mt-auto flex min-h-10 items-center gap-3 text-[14px]">
                <AnimatePresence mode="wait" initial={false}>
                    {step < 6 ? (
                        <m.span key="wait" className="text-night-muted" exit={{ opacity: 0 }}>
                            Your interview is built from these.
                        </m.span>
                    ) : step === 6 ? (
                        <m.span key="prep" className="flex items-center gap-2 text-night-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Loader2 className="size-4 animate-spin" />
                            Preparing your interviewer…
                        </m.span>
                    ) : (
                        <m.span key="ready" className="flex w-full items-center justify-between gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE_OUT_EXPO }}>
                            <span className="text-night-foreground/90">
                                {STANDARD.rounds.length} rounds, built from your job
                            </span>
                            <span className="shrink-0 rounded-md bg-signal px-4 py-2 font-medium whitespace-nowrap text-signal-foreground">Start interview</span>
                        </m.span>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

const TALK = [
    { role: "ai", text: "Walk me through the architecture of your webhook service." },
    { role: "user", text: "Stripe calls our API, we put each event on a queue, and workers process it with an idempotency key." },
    { role: "ai", text: "You mentioned the queue. What happens when a worker crashes halfway through an event?" },
] as const;
const TALK_STEPS = [3200, 5200, 4200, 99_000] as const;

function Bubble({ line, typing }: { line: (typeof TALK)[number]; typing: boolean }) {
    const text = useTypedText(line.text, typing, 44);
    return (
        <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
            className={cn("max-w-[85%] rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed", line.role === "ai" ? "self-start rounded-tl-sm bg-night-raised" : "self-end rounded-tr-sm bg-night-foreground text-night")}
        >
            <span className={cn("label-mono mb-1 block", line.role === "ai" ? "text-night-muted" : "text-night/60")}>{line.role === "ai" ? "Interviewer" : "You"}</span>
            {text}
        </m.div>
    );
}

export function TalkScene({ active }: SceneProps) {
    const step = useSequence(TALK_STEPS, active);
    const speaker = TALK[Math.min(step, TALK.length - 1)]!.role;
    const talking = active && step < TALK.length;
    const aiLevel = useSimulatedLevel(talking && speaker === "ai", 2);
    const userLevel = useSimulatedLevel(talking && speaker === "user", 9);

    return (
        <div className="grid h-full grid-rows-[auto_1fr] gap-3 p-3">
            <div className="grid h-44 grid-cols-2 gap-3 sm:h-56">
                <Tile kind="ai" label="Interviewer" level={aiLevel} />
                <Tile kind="user" label="You" level={userLevel} initials="AL" />
            </div>
            <div className="flex min-h-0 flex-col justify-end gap-2.5 overflow-hidden px-1 pb-1">
                {TALK.slice(0, Math.min(step + 1, TALK.length)).map((line, index) => (
                    <Bubble key={index} line={line} typing={active} />
                ))}
                <p className="label-mono mt-1 text-center text-night-muted">
                    {step === 1 ? "Listening · it waits for you to finish" : "Follows up on what you actually said"}
                </p>
            </div>
        </div>
    );
}

const CODE_STEPS = [5600, 99_000] as const;

export function CodeScene({ active }: SceneProps) {
    const step = useSequence(CODE_STEPS, active);
    const typed = useTypewriter(CODE_LENGTH, active && step === 0);
    const reduce = useReducedMotion() ?? false;
    const silent = useSimulatedLevel(false);

    return (
        <div className="grid h-full grid-cols-1 gap-3 p-3 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
            <div className="hidden min-h-0 grid-rows-[auto_1fr_auto] gap-3 md:grid">
                <div className="grid h-28 grid-cols-2 gap-3">
                    <Tile kind="ai" label="AI" level={silent} compact />
                    <Tile kind="user" label="You" level={silent} initials="AL" compact />
                </div>
                <div className="min-h-0 overflow-hidden">
                    <ProblemCard visible />
                </div>
                <p className="rounded-xl border border-night-line bg-night-raised px-3.5 py-3 text-[13.5px] leading-snug text-night-muted">
                    Stuck? Ask for a hint. There are three, each one a little more direct.
                </p>
            </div>
            <div className="min-h-0 min-w-0">
                <EditorPane count={reduce || step >= 1 ? CODE_LENGTH : typed} testing={step >= 1} />
            </div>
        </div>
    );
}

export function DesignScene({ active }: SceneProps) {
    const caption = useTypedText("How would you keep the queue from backing up when a customer's endpoint is down?", active, 40);

    return (
        <div className="grid h-full grid-rows-[1fr_auto] gap-3 p-3">
            <WhiteboardPane play={active} />
            <p className="min-h-[3em] px-1 text-[14px] leading-snug text-night-foreground/85">
                <span className="label-mono mr-2 text-night-muted">Interviewer</span>
                {caption}
            </p>
        </div>
    );
}

const DIMENSIONS = [
    { label: "Problem solving", score: 82 },
    { label: "Code correctness", score: 93 },
    { label: "Complexity analysis", score: 64 },
    { label: "System design", score: 71 },
    { label: "Communication", score: 80 },
];
const OVERALL = 78;
const RING = 2 * Math.PI * 54;

/** A number counting up to `to` while `active`, easing out; `to` at once under reduced motion. */
export function CountUp({ to, active }: { to: number; active: boolean }) {
    const reduce = useReducedMotion() ?? false;
    const [value, setValue] = useState(reduce ? to : 0);

    useEffect(() => {
        if (reduce) return setValue(to);
        if (!active) return setValue(0);
        const started = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - started) / 1300);
            setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [active, to, reduce]);

    return <>{value}</>;
}

export function ReportScene({ active }: SceneProps) {
    const reduce = useReducedMotion() ?? false;
    const shown = active || reduce;

    return (
        <div className="flex h-full flex-col gap-6 overflow-hidden p-5 sm:p-8">
            <div className="flex items-center gap-6">
                <div className="relative size-32 shrink-0" role="img" aria-label={`An example overall score of ${OVERALL} out of 100`}>
                    <svg viewBox="0 0 128 128" className="size-full -rotate-90">
                        <circle cx="64" cy="64" r="54" fill="none" className="stroke-night-line" strokeWidth="9" />
                        <m.circle
                            cx="64"
                            cy="64"
                            r="54"
                            fill="none"
                            className="stroke-signal"
                            strokeWidth="9"
                            strokeLinecap="round"
                            strokeDasharray={RING}
                            initial={false}
                            animate={{ strokeDashoffset: shown ? RING * (1 - OVERALL / 100) : RING }}
                            transition={{ duration: reduce ? 0 : 1.3, ease: EASE_OUT_EXPO }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-serif text-5xl leading-none tabular-nums">
                            <CountUp to={OVERALL} active={active} />
                        </span>
                        <span className="label-mono mt-1 text-night-muted">of 100</span>
                    </div>
                </div>
                <div>
                    <p className="label-mono text-night-muted">Your report · example</p>
                    <p className="mt-2 font-serif text-3xl tracking-tight">Close</p>
                    <p className="mt-1 text-[14px] leading-snug text-night-muted">Ready in about a minute, every point tied to something you said.</p>
                </div>
            </div>

            <ul className="grid gap-3">
                {DIMENSIONS.map((d, index) => (
                    <li key={d.label} className="grid grid-cols-[10.5rem_1fr_2rem] items-center gap-3 text-[14px]">
                        <span className="truncate text-night-foreground/85">{d.label}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-night-line">
                            <m.span
                                className="block h-full origin-left rounded-full bg-night-foreground"
                                style={{ width: `${d.score}%` }}
                                initial={false}
                                animate={{ scaleX: shown ? 1 : 0 }}
                                transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.3 + index * 0.08 }}
                            />
                        </span>
                        <span className="text-right font-mono tabular-nums text-night-muted">{d.score}</span>
                    </li>
                ))}
            </ul>

            <m.blockquote
                className="border-l-2 border-signal pl-4"
                initial={false}
                animate={{ opacity: shown ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 1 }}
            >
                <p className="font-serif text-[21px] leading-snug italic">“I'd keep a map of what I've seen, so it's one pass.”</p>
                <p className="label-mono mt-2 text-night-muted">What's working · quoted from you</p>
            </m.blockquote>

            <div className="mt-auto flex items-center justify-between gap-4 rounded-xl border border-night-line bg-night-raised px-4 py-3">
                <div className="min-w-0">
                    <p className="label-mono text-night-muted">Top of your study plan</p>
                    <p className="mt-1 truncate text-[14.5px]">Say complexity out loud before you code</p>
                </div>
                <span className="shrink-0 rounded-md bg-signal px-3 py-1.5 text-[13px] font-medium text-signal-foreground">Practice this</span>
            </div>
        </div>
    );
}
