import { CodeXml, FileText, PenLine, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { LogoMark } from "@/components/brand/Logo";
import { DEMO_AUDIO_MS } from "@/components/landing/demoAudio.generated";
import { CHAPTERS, DEMO, type DemoChapter, type DemoStep } from "@/components/landing/demoScript";
import { CODE_LENGTH, useTypewriter } from "@/components/landing/MiniEditor";
import { DesignCard, EditorPane, ProblemCard, WhiteboardPane } from "@/components/landing/roomParts";
import { CountUp, SetupScene } from "@/components/landing/scenes";
import { formatClock } from "@/hooks/useElapsed";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTypedText } from "@/hooks/useSequence";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A spoken step lasts as long as its line takes to say, plus a breath before the next one. */
const GAP_MS = 750;
const stepMs = (step: DemoStep) => Math.max(step.minMs, step.speaker ? (DEMO_AUDIO_MS[step.id] ?? 4000) + GAP_MS : 0);
/** What reduced motion shows, standing still (the chapter bar still switches between chapters). */
const FROZEN_STEP = DEMO.findIndex((step) => step.id === "tests");
const firstStepOf = (chapter: DemoChapter) => DEMO.findIndex((step) => step.chapter === chapter);

/** Where the current step sits in its chapter, as fractions of the chapter's length, for the chapter bar. */
function chapterProgress(index: number): { from: number; to: number } {
    const step = DEMO[index]!;
    const steps = DEMO.map((s, i) => ({ s, i })).filter(({ s }) => s.chapter === step.chapter);
    const total = steps.reduce((sum, { s }) => sum + stepMs(s), 0);
    const before = steps.filter(({ i }) => i < index).reduce((sum, { s }) => sum + stepMs(s), 0);
    return { from: before / total, to: (before + stepMs(step)) / total };
}

const CHAPTER_NOTE: Record<DemoChapter, string> = {
    setup: "The role, your level, the job description, your resume and GitHub.",
    interview: "Out loud, with live code, hidden tests and a whiteboard.",
    report: "A score, feedback on every skill and a study plan.",
};

/** The subtitles, typed at the pace the line is spoken so they keep time with the audio. At most three lines, like live captions. */
function Subtitle({ step, active }: { step: DemoStep; active: boolean }) {
    const spokenMs = DEMO_AUDIO_MS[step.id];
    const charsPerSecond = spokenMs ? Math.min(60, Math.max(14, step.text.length / (spokenMs / 1000))) : 1000;
    const typed = useTypedText(step.text, active, charsPerSecond);
    const who = step.speaker === "ai" ? "Interviewer" : step.speaker === "user" ? "You" : step.speaker === "narrator" ? "Guide" : null;

    return (
        <div className="flex h-[4.6em] flex-col justify-end overflow-hidden px-4 pb-3 text-[13.5px] leading-snug sm:px-6 sm:text-[15px]" aria-hidden>
            {step.view !== "title" && (
                <p className="text-center text-night-foreground/85">
                    {who && <span className={cn("label-mono mr-2", step.speaker === "narrator" ? "text-signal" : "text-night-muted")}>{who}</span>}
                    {step.speaker ? typed : <span className="text-night-muted">{step.text}</span>}
                </p>
            )}
        </div>
    );
}

/**
 * The demo's sound. Nothing is downloaded until the visitor asks for it; then every clip is fetched up front, so the
 * lines follow each other without a gap, and the clip for the step on screen plays whenever the video is in view.
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

function ChapterBar({ index, playing, onPick }: { index: number; playing: boolean; onPick: (chapter: DemoChapter) => void }) {
    const current = DEMO[index]!.chapter;
    const at = CHAPTERS.findIndex((c) => c.id === current);
    const { from, to } = chapterProgress(index);

    return (
        <div className="grid grid-cols-3 border-b border-night-line" role="group" aria-label="Chapters of the example">
            {CHAPTERS.map((chapter, i) => (
                <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onPick(chapter.id)}
                    aria-current={i === at ? "step" : undefined}
                    className={cn(
                        "relative flex items-center gap-2 px-3 py-2.5 text-left text-[13px] transition-colors sm:px-4",
                        i === at ? "text-night-foreground" : "text-night-muted hover:text-night-foreground",
                        i > 0 && "border-l border-night-line",
                    )}
                >
                    <span className="font-mono text-[12px]">{i + 1}</span>
                    <span className="truncate">{chapter.label}</span>
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-night-line">
                        {i < at && <span className="absolute inset-0 bg-signal/60" />}
                        {i === at && (
                            <m.span
                                key={`${index}-${playing}`}
                                className="absolute inset-0 origin-left bg-signal"
                                initial={{ scaleX: from }}
                                animate={{ scaleX: playing ? to : from }}
                                transition={{ duration: playing ? stepMs(DEMO[index]!) / 1000 : 0, ease: "linear" }}
                            />
                        )}
                    </span>
                </button>
            ))}
        </div>
    );
}

function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={on}
            aria-label={on ? "Turn the example's sound off" : "Play the example with sound"}
            className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors",
                on ? "border-signal/60 text-night-foreground" : "border-night-line text-night-muted hover:text-night-foreground",
            )}
        >
            {on ? <Volume2 className="size-3.5 text-signal" /> : <VolumeX className="size-3.5" />}
            <span className="hidden sm:inline">{on ? "Sound on" : "Sound off"}</span>
        </button>
    );
}

/** The chapter's opening card: which step of three this is, in a line. */
function TitleCard({ chapter }: { chapter: DemoChapter }) {
    const info = CHAPTERS.find((c) => c.id === chapter)!;
    const n = CHAPTERS.indexOf(info) + 1;
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <m.p className="label-mono text-signal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}>
                Step {n} of 3
            </m.p>
            <m.p
                className="mt-4 font-serif text-[clamp(2.2rem,1.4rem+3vw,3.6rem)] leading-none tracking-tight"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT_EXPO, delay: 0.08 }}
            >
                {info.title}
            </m.p>
            <m.p className="mt-4 max-w-md text-[15px] text-night-muted sm:text-[16px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}>
                {CHAPTER_NOTE[chapter]}
            </m.p>
        </div>
    );
}

const REPORT_SKILLS = [
    { label: "Problem solving", score: 82 },
    { label: "Code correctness", score: 93 },
    { label: "Communication", score: 84 },
    { label: "System design", score: 71 },
    { label: "Complexity analysis", score: 61 },
];
const RING = 2 * Math.PI * 54;

/** The report, laid out for the video's wide frame: the score beside the skills, then the top of the study plan. */
function ReportView({ active }: { active: boolean }) {
    const reduce = useReducedMotion() ?? false;
    const shown = active || reduce;

    return (
        <div className="mx-auto grid h-full max-w-4xl content-center gap-6 overflow-hidden p-5 sm:p-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10">
            <div>
                <div className="flex items-center gap-5">
                    <div className="relative size-32 shrink-0" role="img" aria-label="An example overall score of 78 out of 100">
                        <svg viewBox="0 0 128 128" className="size-full -rotate-90">
                            <circle cx="64" cy="64" r="54" fill="none" className="stroke-night-line" strokeWidth="9" />
                            <m.circle
                                cx="64" cy="64" r="54" fill="none" className="stroke-signal" strokeWidth="9" strokeLinecap="round" strokeDasharray={RING}
                                initial={false}
                                animate={{ strokeDashoffset: shown ? RING * (1 - 0.78) : RING }}
                                transition={{ duration: reduce ? 0 : 1.4, ease: EASE_OUT_EXPO }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="font-serif text-5xl leading-none tabular-nums"><CountUp to={78} active={active} /></span>
                            <span className="label-mono mt-1 text-night-muted">of 100</span>
                        </div>
                    </div>
                    <div>
                        <p className="label-mono text-night-muted">Backend Engineer</p>
                        <p className="mt-2 font-serif text-3xl tracking-tight">Close</p>
                        <p className="mt-1 text-[14px] leading-snug text-night-muted">Strong on correctness. Complexity is holding the score back.</p>
                    </div>
                </div>
                <m.blockquote
                    className="mt-6 hidden border-l-2 border-signal pl-4 sm:block"
                    initial={false}
                    animate={{ opacity: shown ? 1 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.9 }}
                >
                    <p className="font-serif text-[21px] leading-snug italic">“I'll keep a hash map of what I've seen, so I can do it in one pass.”</p>
                    <p className="label-mono mt-2 text-night-muted">What's working · quoted from you</p>
                </m.blockquote>
            </div>

            <div className="grid content-center gap-5">
                <ul className="grid gap-3">
                    {REPORT_SKILLS.map((d, i) => (
                        <li key={d.label} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 text-[14px]">
                            <span className="truncate text-night-foreground/85">{d.label}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-night-line">
                                <m.span
                                    className="block h-full origin-left rounded-full bg-night-foreground"
                                    style={{ width: `${d.score}%` }}
                                    initial={false}
                                    animate={{ scaleX: shown ? 1 : 0 }}
                                    transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.3 + i * 0.08 }}
                                />
                            </span>
                            <span className="text-right font-mono tabular-nums text-night-muted">{d.score}</span>
                        </li>
                    ))}
                </ul>
                <m.div
                    className="flex items-center justify-between gap-4 rounded-xl border border-night-line bg-night-raised px-4 py-3"
                    initial={false}
                    animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 10 }}
                    transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 1.3 }}
                >
                    <div className="min-w-0">
                        <p className="label-mono text-night-muted">Top of your study plan</p>
                        <p className="mt-1 truncate text-[14.5px]">Complexity analysis</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-signal px-3 py-1.5 text-[13px] font-medium text-signal-foreground">Practice this</span>
                </m.div>
            </div>
        </div>
    );
}

/** The live interview: the two speakers, then the editor or the whiteboard beside them. */
function RoomView({ step, playing, frozen }: { step: DemoStep; playing: boolean; frozen: boolean }) {
    const wide = useMediaQuery("(min-width: 768px)");
    const talking = playing && !frozen;
    const aiLevel = useSimulatedLevel(talking && step.speaker === "ai", 1);
    const userLevel = useSimulatedLevel(talking && step.speaker === "user", 7);
    const split = step.view === "code" || step.view === "tests" || step.view === "design";
    const drawing = step.view === "design";

    const typed = useTypewriter(CODE_LENGTH, step.view === "code" && !frozen);
    const count = frozen || step.view === "tests" || step.view === "design" ? CODE_LENGTH : step.view === "code" ? typed : 0;

    return (
        <div
            className="grid h-full gap-3 p-3 transition-[grid-template-columns] duration-700 ease-out-expo"
            style={{ gridTemplateColumns: split ? (wide ? "minmax(0,0.42fr) minmax(0,1fr)" : "minmax(0,0fr) minmax(0,1fr)") : "minmax(0,1fr) minmax(0,0fr)" }}
        >
            <div
                className="grid min-h-0 min-w-0 gap-3 overflow-hidden transition-[grid-template-rows] duration-700 ease-out-expo"
                style={{ gridTemplateRows: split ? "minmax(0,0.36fr) minmax(0,0.64fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
            >
                <div className="grid min-h-0 grid-cols-2 gap-3">
                    <Tile kind="ai" label="Interviewer" level={aiLevel} compact={split} />
                    <Tile kind="user" label="You" level={userLevel} initials="AL" compact={split} />
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
                    <WhiteboardPane play={drawing && playing} />
                </div>
            </div>
        </div>
    );
}

/**
 * The example as a short guided video, in three chapters: setting the interview up from the job, the interview itself
 * (from joining the call to the goodbye), and the report. A chapter bar shows where it is and jumps between chapters;
 * a guide explains the setup and the report. Muted by default; the sound toggle plays the real voices.
 */
export function ProductWindow({ className }: { className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
    const reduceMotion = useReducedMotion() ?? false;
    const [soundOn, setSoundOn] = useState(false);
    // Standing still under reduced motion, unless the visitor asked to hear it, which plays it through.
    const frozen = reduceMotion && !soundOn;
    const [index, setIndex] = useState(0);
    const step = DEMO[index]!;

    useEffect(() => {
        if (reduceMotion) setIndex(FROZEN_STEP);
    }, [reduceMotion]);

    useEffect(() => {
        if (!inView || frozen) return;
        const id = setTimeout(() => setIndex((current) => (current + 1) % DEMO.length), stepMs(DEMO[index]!));
        return () => clearTimeout(id);
    }, [inView, frozen, index]);

    useDemoAudio(step, index, soundOn, inView);

    const toggleSound = useCallback(() => {
        // Turning the sound on starts the video from the beginning, so it is heard from the first word.
        if (!soundOn) setIndex(0);
        setSoundOn(!soundOn);
    }, [soundOn]);

    const pickChapter = useCallback(
        (chapter: DemoChapter) => {
            // Standing still, there's no title card to sit through: straight to the chapter's content.
            const first = firstStepOf(chapter);
            setIndex(frozen ? (chapter === "interview" ? FROZEN_STEP : first + 1) : first);
        },
        [frozen],
    );

    // The room's clock jumps to where the interview is at each step, then runs.
    const [seconds, setSeconds] = useState(0);
    useEffect(() => setSeconds(step.clock ?? 0), [step]);
    const connecting = step.chapter === "interview" && (step.view === "connecting" || step.view === "title");
    useEffect(() => {
        if (!inView || frozen || connecting || step.chapter !== "interview") return;
        const id = setInterval(() => setSeconds((current) => current + 1), 1000);
        return () => clearInterval(id);
    }, [inView, frozen, connecting, step.chapter]);

    const playing = inView && !frozen;
    const bodyKey = step.view === "title" ? `title-${step.chapter}` : step.chapter;

    return (
        <div ref={ref} className={className}>
            <div className="w-full overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground shadow-[0_50px_100px_-40px_rgba(21,21,18,0.55)]">
                <ChapterBar index={index} playing={playing} onPick={pickChapter} />

                <div className="flex h-12 items-center justify-between gap-3 border-b border-night-line px-4">
                    {step.chapter === "interview" ? (
                        <>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <LogoMark className="size-5" />
                                <span className="truncate text-[14px] font-medium">Backend Engineer</span>
                            </div>
                            <div className="label-mono flex items-center gap-2 text-night-muted">
                                <span className={cn("size-1.5 rounded-full", connecting ? "bg-night-muted" : "animate-live bg-signal")} />
                                {connecting ? "Joining" : "Live"}
                                <span className="text-night-foreground">{formatClock(seconds)}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <LogoMark className="size-5" />
                                <span className="truncate text-[14px] font-medium">{step.chapter === "setup" ? "New interview" : "Interview report"}</span>
                            </div>
                            <span className="label-mono hidden items-center gap-2 text-night-muted sm:flex">
                                {step.chapter === "report" && <FileText className="size-3.5" />}
                                {step.chapter === "setup" ? "Interview setup" : "Backend Engineer · Full loop"}
                            </span>
                        </>
                    )}
                    <div className="flex items-center justify-end gap-3 md:min-w-[16rem]">
                        {step.chapter === "interview" && step.round && (
                            <span className="hidden items-center gap-2 text-[13px] text-night-muted md:flex">
                                {step.view === "design" ? <PenLine className="size-3.5" /> : <CodeXml className="size-3.5" />}
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
                        )}
                        <SoundToggle on={soundOn} onToggle={toggleSound} />
                    </div>
                </div>

                <div
                    role="img"
                    aria-label="An example of Intervyu in three steps: setting up the interview from a job description, resume and GitHub; the spoken interview with a coding problem, hidden tests and a whiteboard design; and the scored report with a study plan."
                    className="relative h-[540px] sm:h-[500px] lg:h-[520px]"
                >
                    <AnimatePresence mode="wait" initial={false}>
                        <m.div
                            key={bodyKey}
                            className="absolute inset-0"
                            initial={{ opacity: 0, scale: 0.985 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.01 }}
                            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                        >
                            {step.view === "title" ? (
                                <TitleCard chapter={step.chapter} />
                            ) : step.chapter === "setup" ? (
                                <div className="mx-auto h-full max-w-2xl">
                                    <SetupScene active={playing || frozen} />
                                </div>
                            ) : step.chapter === "report" ? (
                                <ReportView active={playing} />
                            ) : (
                                <RoomView step={step} playing={inView} frozen={frozen} />
                            )}
                        </m.div>
                    </AnimatePresence>
                </div>

                <div className="border-t border-night-line pt-3">
                    <Subtitle key={`${index}-${step.id}`} step={step} active={inView} />
                </div>
            </div>
        </div>
    );
}
