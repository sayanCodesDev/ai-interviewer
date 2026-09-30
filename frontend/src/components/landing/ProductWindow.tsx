import { Check, CodeXml, FileText, PenLine, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { LogoMark } from "@/components/brand/Logo";
import { DEMO_AUDIO_MS } from "@/components/landing/demoAudio.generated";
import { CHAPTERS, DEMO, REPORT_SECTIONS, type DemoChapter, type DemoStep, type ReportSection } from "@/components/landing/demoScript";
import { CODE_LENGTH, MiniEditor, useTypewriter } from "@/components/landing/MiniEditor";
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
            {(step.view !== "title" || step.speaker) && step.text && (
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
    { label: "Problem solving", score: 8.2 },
    { label: "Code correctness", score: 9.3, note: "from tests" },
    { label: "Communication", score: 8.4 },
    { label: "Technical depth", score: 7.9 },
    { label: "System design", score: 7.1 },
    { label: "Complexity analysis", score: 6.1 },
];
const REPORT_PLAN = [
    { topic: "Complexity analysis", why: "Say the time and space before you start coding.", priority: "high" },
    { topic: "Queue backpressure", why: "The design stopped short of what happens when consumers fall behind.", priority: "medium" },
    { topic: "Kafka ordering guarantees", why: "Partition keys came up and stayed vague.", priority: "medium" },
];
const RING = 2 * Math.PI * 54;
/** The report scrolls like a page being read: slow to start, slow to settle. */
const SCROLL_EASE = [0.65, 0, 0.35, 1] as const;

function ReportHeading({ label, title }: { label: string; title: string }) {
    return (
        <div className="mb-4">
            <p className="label-mono text-night-muted">{label}</p>
            <p className="mt-2 font-serif text-[26px] leading-tight tracking-tight">{title}</p>
        </div>
    );
}

/**
 * The report as a page being scrolled through while the guide talks about it: the score, the skills with their
 * evidence, the reviewed code, the study plan. Each part animates in as it is reached.
 */
function ReportView({ section, playing }: { section: ReportSection; playing: boolean }) {
    const reduce = useReducedMotion() ?? false;
    const viewport = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const anchors = useRef<Partial<Record<ReportSection, HTMLElement | null>>>({});
    const [scroll, setScroll] = useState({ offset: 0, max: 1 });
    const reachedIndex = REPORT_SECTIONS.indexOf(section);
    const reached = (s: ReportSection) => reduce || REPORT_SECTIONS.indexOf(s) <= reachedIndex;

    useEffect(() => {
        const measure = () => {
            const el = anchors.current[section];
            if (!el || !viewport.current || !content.current) return;
            const max = Math.max(1, content.current.scrollHeight - viewport.current.clientHeight);
            setScroll({ offset: Math.min(max, Math.max(0, el.offsetTop - 24)), max });
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [section]);

    return (
        <div ref={viewport} className="relative h-full overflow-hidden">
            <m.div
                ref={content}
                className="relative mx-auto max-w-3xl px-5 pt-6 pb-10 sm:px-8"
                initial={false}
                animate={{ y: -scroll.offset }}
                transition={{ duration: reduce ? 0 : 1.1, ease: SCROLL_EASE }}
            >
                <section ref={(el) => { anchors.current.score = el; }}>
                    <p className="label-mono text-night-muted">Interview report · Backend Engineer · Full loop</p>
                    <div className="mt-5 flex flex-wrap items-center gap-6">
                        <div className="relative size-32 shrink-0" role="img" aria-label="An example overall score of 78 out of 100">
                            <svg viewBox="0 0 128 128" className="size-full -rotate-90">
                                <circle cx="64" cy="64" r="54" fill="none" className="stroke-night-line" strokeWidth="9" />
                                <m.circle
                                    cx="64" cy="64" r="54" fill="none" className="stroke-signal" strokeWidth="9" strokeLinecap="round" strokeDasharray={RING}
                                    initial={false}
                                    animate={{ strokeDashoffset: playing || reduce ? RING * (1 - 0.78) : RING }}
                                    transition={{ duration: reduce ? 0 : 1.4, ease: EASE_OUT_EXPO }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-serif text-5xl leading-none tabular-nums"><CountUp to={78} active={playing} /></span>
                                <span className="label-mono mt-1 text-night-muted">of 100</span>
                            </div>
                        </div>
                        <div className="min-w-[14rem] flex-1">
                            <p className="label-mono text-signal">Close</p>
                            <p className="mt-2 font-serif text-[26px] leading-snug tracking-tight">
                                Strong on correctness and communication. Complexity is what's holding the score back.
                            </p>
                        </div>
                    </div>
                    <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-night-line pt-5 sm:grid-cols-4">
                        {[["Time", "72 min"], ["You said", "3,480 words"], ["Solved", "3 of 3"], ["Hints", "1"]].map(([k, v]) => (
                            <div key={k}>
                                <dt className="label-mono text-night-muted">{k}</dt>
                                <dd className="mt-1 font-serif text-xl">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section ref={(el) => { anchors.current.skills = el; }} className="mt-12">
                    <ReportHeading label="Scores" title="How you did, skill by skill" />
                    <ul className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
                        {REPORT_SKILLS.map((d, i) => (
                            <li key={d.label}>
                                <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
                                    <span className="text-night-foreground/90">
                                        {d.label}
                                        {d.note && <span className="label-mono ml-2 text-night-muted">{d.note}</span>}
                                    </span>
                                    <span className="font-mono text-[13px] tabular-nums text-night-muted">{d.score.toFixed(1)}/10</span>
                                </div>
                                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-night-line">
                                    <m.span
                                        className="block h-full origin-left rounded-full bg-night-foreground"
                                        style={{ width: `${d.score * 10}%` }}
                                        initial={false}
                                        animate={{ scaleX: reached("skills") ? 1 : 0 }}
                                        transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.6 + i * 0.07 }}
                                    />
                                </span>
                            </li>
                        ))}
                    </ul>
                    <blockquote className="mt-6 border-l-2 border-signal pl-4">
                        <p className="font-serif text-[20px] leading-snug italic">“Every event carries an idempotency key, so if a delivery is retried, processing it again is a no-op.”</p>
                        <p className="label-mono mt-2 text-night-muted">Technical depth · quoted from you</p>
                    </blockquote>
                </section>

                <section ref={(el) => { anchors.current.code = el; }} className="mt-12">
                    <ReportHeading label="Coding" title="Your code, reviewed line by line" />
                    <div className="overflow-hidden rounded-xl border border-night-line">
                        <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-3">
                            <span className="text-[15px]">Two Sum <span className="label-mono ml-2 text-night-muted">Easy · Python</span></span>
                            <span className="rounded-full bg-signal px-2.5 py-0.5 text-[12.5px] font-medium text-signal-foreground">14 of 14 tests</span>
                        </div>
                        <div className="bg-night-sunken px-4 py-3">
                            <MiniEditor showCaret={false} />
                        </div>
                        <div className="border-t border-night-line bg-night-raised px-4 py-3 text-[14px]">
                            <p className="flex items-center gap-2">
                                <Check className="size-4 text-signal" />
                                <span className="label-mono text-signal">Done well · line 4</span>
                            </p>
                            <p className="mt-1 text-night-foreground/85">Checking for the complement before storing each number keeps it to one pass.</p>
                            <p className="label-mono mt-3 text-night-muted">Intended solution · O(n) time, O(n) space</p>
                        </div>
                    </div>
                </section>

                <section ref={(el) => { anchors.current.plan = el; }} className="mt-12">
                    <ReportHeading label="Your preparation plan" title="What to practise, in order" />
                    <ol className="grid gap-2.5">
                        {REPORT_PLAN.map((item, i) => (
                            <m.li
                                key={item.topic}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-night-line bg-night-raised px-4 py-3"
                                initial={false}
                                animate={{ opacity: reached("plan") ? 1 : 0, y: reached("plan") ? 0 : 12 }}
                                transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.8 + i * 0.15 }}
                            >
                                <span className="font-mono text-[13px] text-night-muted">{i + 1}</span>
                                <span className="min-w-[12rem] flex-1">
                                    <span className="block text-[15px] font-medium">{item.topic}</span>
                                    <span className="block text-[13.5px] leading-snug text-night-muted">{item.why}</span>
                                </span>
                                <span className={cn("label-mono rounded-full border px-2.5 py-1", item.priority === "high" ? "border-transparent bg-night-foreground text-night" : "border-night-line text-night-muted")}>
                                    {item.priority}
                                </span>
                                <span className={cn("rounded-md border px-3 py-1.5 text-[13px] font-medium", i === 0 ? "border-transparent bg-signal text-signal-foreground" : "border-night-line")}>
                                    Practice this
                                </span>
                            </m.li>
                        ))}
                    </ol>
                </section>
            </m.div>

            {/* A slim scrollbar, so it reads as a page being scrolled. */}
            <div aria-hidden className="absolute top-3 right-1.5 bottom-3 w-1 rounded-full bg-night-line/60">
                <m.div
                    className="absolute inset-x-0 h-16 rounded-full bg-night-muted"
                    initial={false}
                    animate={{ top: `calc(${(scroll.offset / scroll.max) * 100}% - ${(scroll.offset / scroll.max) * 4}rem)` }}
                    transition={{ duration: reduce ? 0 : 1.1, ease: SCROLL_EASE }}
                />
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
                                <ReportView section={step.section ?? "score"} playing={playing} />
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
