import { AnimatePresence, m, useInView, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";

import { CodeScene, DesignScene, ReportScene, SetupScene, TalkScene, type SceneProps } from "@/components/landing/scenes";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { EASE_OUT_EXPO, fadeUp, inViewOnce } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** `phoneHeight`: how tall the scene's frame is when the steps are stacked on a small screen (each scene needs different room). */
const STEPS: ReadonlyArray<{ title: string; text: string; Scene: (props: SceneProps) => React.ReactNode; phoneHeight: number }> = [
    {
        title: "Set it up around your job",
        text: "Pick the role and your level, paste the job description, and add your resume and GitHub. Intervyu suggests a format for your level and builds every round from what you gave it, in a few seconds.",
        Scene: SetupScene,
        phoneHeight: 660,
    },
    {
        title: "Talk it through",
        text: "The interviewer speaks first, asks about the projects you've actually built and follows up on what you say. It waits for you to finish a thought, and stops if you cut in, like a person would.",
        Scene: TalkScene,
        phoneHeight: 560,
    },
    {
        title: "Code against real tests",
        text: "A full editor opens beside the conversation in JavaScript, TypeScript, Python, C++ or Java. Run the examples, submit against hidden tests, ask for a hint if you're stuck, then explain your complexity.",
        Scene: CodeScene,
        phoneHeight: 500,
    },
    {
        title: "Sketch the design",
        text: "In a system-design round the editor becomes a whiteboard for boxes and arrows, and when you share it, the interviewer reads the diagram and asks about it. You can open it on any question to sketch an answer.",
        Scene: DesignScene,
        phoneHeight: 420,
    },
    {
        title: "Get a report you can act on",
        text: "About a minute after you finish: a score out of 100, a breakdown by skill, feedback on every round and a study plan in priority order. Retry any topic you missed in one click.",
        Scene: ReportScene,
        phoneHeight: 640,
    },
];

function SceneFrame({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    return (
        <div className={cn("overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground", className)} style={style}>
            {children}
        </div>
    );
}

function Heading() {
    return (
        <div>
            <p className="label-mono text-muted-foreground">How it works</p>
            <h2 className="text-h2 mt-4">From job description to study plan, in five steps.</h2>
        </div>
    );
}

function StickyStory() {
    const ref = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(0);
    const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

    useMotionValueEvent(scrollYProgress, "change", (value) => {
        setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(value * STEPS.length))));
    });

    const ActiveScene = STEPS[active]!.Scene;

    return (
        <div ref={ref} className="relative" style={{ height: `${STEPS.length * 100 + 40}vh` }}>
            <div className="sticky top-0 flex h-screen items-center">
                <div className="page-container grid w-full grid-cols-12 items-center gap-12 pt-14">
                    <div className="col-span-5">
                        <Heading />

                        <div className="relative mt-10 pl-8">
                            <div aria-hidden className="absolute top-0 left-0 h-full w-px bg-border" />
                            <m.div aria-hidden className="absolute top-0 left-0 h-full w-px origin-top bg-foreground" style={{ scaleY: scrollYProgress }} />

                            <ol className="grid gap-4">
                                {STEPS.map((step, index) => {
                                    const isActive = index === active;
                                    return (
                                        <li key={step.title} aria-current={isActive ? "step" : undefined}>
                                            <div className={cn("flex items-baseline gap-4 transition-colors duration-500", isActive ? "text-foreground" : "text-muted-foreground")}>
                                                <span className="font-mono text-[13px]">{String(index + 1).padStart(2, "0")}</span>
                                                <h3 className="font-serif text-[clamp(1.45rem,1.1rem+0.9vw,1.9rem)] leading-tight tracking-tight">{step.title}</h3>
                                            </div>
                                            <div
                                                className={cn(
                                                    "grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo",
                                                    isActive ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                                )}
                                            >
                                                <p className="min-h-0 overflow-hidden pl-10 text-[17px] leading-relaxed text-muted-foreground">
                                                    <span className="mt-2 block max-w-md">{step.text}</span>
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    </div>

                    <div className="col-span-7">
                        <SceneFrame className="h-[min(560px,72vh)]">
                            <AnimatePresence mode="wait">
                                <m.div
                                    key={active}
                                    className="h-full"
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -14 }}
                                    transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                                >
                                    <ActiveScene active />
                                </m.div>
                            </AnimatePresence>
                        </SceneFrame>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** One step on small screens: its scene plays once it scrolls into view. */
function StackedStep({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "0px 0px -25% 0px" });

    return (
        <m.div ref={ref} variants={fadeUp} initial="hidden" whileInView="visible" viewport={inViewOnce}>
            <div className="flex items-baseline gap-4">
                <span className="font-mono text-[13px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="text-h3">{step.title}</h3>
            </div>
            <p className="mt-3 max-w-lg pl-9 text-[17px] leading-relaxed text-muted-foreground">{step.text}</p>
            <SceneFrame className="mt-6" style={{ height: step.phoneHeight }}>
                <step.Scene active={inView} />
            </SceneFrame>
        </m.div>
    );
}

function StackedStory() {
    return (
        <div className="page-container py-20 sm:py-24">
            <Heading />
            <div className="mt-14 grid grid-cols-1 gap-16">
                {STEPS.map((step, index) => (
                    <StackedStep key={step.title} step={step} index={index} />
                ))}
            </div>
        </div>
    );
}

export function HowItWorks() {
    const desktop = useMediaQuery("(min-width: 1024px)");

    return (
        <section id="how-it-works" className="scroll-mt-16">
            {desktop ? <StickyStory /> : <StackedStory />}
        </section>
    );
}
