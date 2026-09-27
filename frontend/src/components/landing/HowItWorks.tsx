import { AnimatePresence, m, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";

import { CodeScene, FeedbackScene, SetupScene, TalkScene } from "@/components/landing/scenes";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { EASE_OUT_EXPO, fadeUp, inViewOnce } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STEPS = [
    {
        title: "Set up",
        text: "Choose the role and your level, then paste the job description. Add your resume or GitHub and the questions fit what you've actually built.",
        Scene: SetupScene,
    },
    {
        title: "Talk",
        text: "The interviewer speaks first, asks about your background and follows up on what you say. Answer out loud, like a real call.",
        Scene: TalkScene,
    },
    {
        title: "Code",
        text: "For each problem an editor opens beside the conversation. Run your code on the examples, submit it against hidden tests, then talk through the complexity.",
        Scene: CodeScene,
    },
    {
        title: "Get your report",
        text: "Minutes later you have a score out of 100, feedback on every part, the full transcript and a plan for what to practise next.",
        Scene: FeedbackScene,
    },
] as const;

function SceneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground", className)}>{children}</div>
    );
}

function Heading() {
    return (
        <div>
            <p className="label-mono text-muted-foreground">How it works</p>
            <h2 className="text-h2 mt-4">Four steps, start to finish.</h2>
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

                        <div className="relative mt-12 pl-8">
                            <div aria-hidden className="absolute top-0 left-0 h-full w-px bg-border" />
                            <m.div aria-hidden className="absolute top-0 left-0 h-full w-px origin-top bg-foreground" style={{ scaleY: scrollYProgress }} />

                            <ol className="grid gap-5">
                                {STEPS.map((step, index) => {
                                    const isActive = index === active;
                                    return (
                                        <li key={step.title} aria-current={isActive ? "step" : undefined}>
                                            <div className={cn("flex items-baseline gap-4 transition-colors duration-500", isActive ? "text-foreground" : "text-muted-foreground")}>
                                                <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                                                <h3 className="text-h3">{step.title}</h3>
                                            </div>
                                            <div
                                                className={cn(
                                                    "grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo",
                                                    isActive ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                                )}
                                            >
                                                <p className="min-h-0 overflow-hidden pl-9 text-[15px] leading-relaxed text-muted-foreground">
                                                    <span className="mt-2 block max-w-sm">{step.text}</span>
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    </div>

                    <div className="col-span-7">
                        <SceneFrame className="h-[min(520px,68vh)]">
                            <AnimatePresence mode="wait">
                                <m.div
                                    key={active}
                                    className="h-full"
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -14 }}
                                    transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                                >
                                    <ActiveScene />
                                </m.div>
                            </AnimatePresence>
                        </SceneFrame>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StackedStory() {
    return (
        <div className="page-container py-20 sm:py-24">
            <Heading />
            <div className="mt-14 grid grid-cols-1 gap-16">
                {STEPS.map((step, index) => (
                    <m.div key={step.title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={inViewOnce}>
                        <div className="flex items-baseline gap-4">
                            <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                            <h3 className="text-h3">{step.title}</h3>
                        </div>
                        <p className="mt-3 max-w-md pl-9 text-[15px] leading-relaxed text-muted-foreground">{step.text}</p>
                        <SceneFrame className="mt-6 h-[420px]">
                            <step.Scene />
                        </SceneFrame>
                    </m.div>
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
