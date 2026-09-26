import { ArrowDown, ArrowRight } from "lucide-react";
import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { ProductWindow } from "@/components/landing/ProductWindow";
import { useStartInterview } from "@/components/landing/useStartInterview";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EASE_OUT_EXPO } from "@/lib/motion";

/** One line of the headline, revealed from behind a mask. */
function Line({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    return (
        <span className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
            <m.span
                className="block"
                initial={{ y: "115%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay }}
            >
                {children}
            </m.span>
        </span>
    );
}

/** Italic emphasis with a marker that draws in (light theme) or lime text (dark theme). */
function Emphasis({ children }: { children: React.ReactNode }) {
    return (
        <span className="relative inline-block italic">
            <m.span
                aria-hidden
                className="absolute inset-x-[-0.06em] bottom-[0.1em] -z-10 h-[0.42em] origin-left rounded-[0.08em] bg-signal dark:bg-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: EASE_OUT_EXPO, delay: 1.05 }}
            />
            <span className="dark:text-signal">{children}</span>
        </span>
    );
}

export function Hero() {
    const { start, checking } = useStartInterview();
    const windowRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useReducedMotion();

    // The window starts tilted back and settles flat as it scrolls into place.
    const { scrollYProgress } = useScroll({ target: windowRef, offset: ["start end", "start 0.3"] });
    const rotateX = useTransform(scrollYProgress, [0, 1], [12, 0]);
    const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
    const y = useTransform(scrollYProgress, [0, 1], [48, 0]);

    return (
        <section className="relative overflow-x-clip pt-32 pb-20 sm:pt-40 sm:pb-28">
            <div className="page-container">
                <m.p
                    className="label-mono flex items-center gap-2.5 text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                >
                    <span className="size-1.5 rounded-full bg-foreground" />
                    Voice-first technical interviews
                </m.p>

                <h1 className="text-display relative isolate mt-6">
                    <Line>A technical interview</Line>
                    <Line delay={0.09}>
                        that <Emphasis>actually talks back.</Emphasis>
                    </Line>
                </h1>

                <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                    <m.p
                        className="max-w-md text-[17px] leading-relaxed text-muted-foreground md:max-w-[22rem] lg:max-w-md"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.45 }}
                    >
                        Talk to an AI interviewer, solve real problems in a live code editor, and hear how you did before the session ends.
                    </m.p>

                    <m.div
                        className="flex shrink-0 flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.55 }}
                    >
                        <Button variant="signal" size="lg" onClick={start} disabled={checking} className="group">
                            {checking && <Spinner />}
                            Start your interview
                            {!checking && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                        </Button>
                        <a
                            href="#how-it-works"
                            className="group inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                        >
                            See how it works
                            <ArrowDown className="size-4 transition-transform duration-200 group-hover:translate-y-0.5" />
                        </a>
                    </m.div>
                </div>

                <m.div
                    className="mt-14 sm:mt-20"
                    style={{ perspective: 1600 }}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: EASE_OUT_EXPO, delay: 0.7 }}
                >
                    <m.div
                        ref={windowRef}
                        className="mx-auto max-w-[1080px]"
                        style={reduceMotion ? undefined : { rotateX, scale, y, transformOrigin: "50% 0%" }}
                    >
                        <ProductWindow />
                    </m.div>
                    <p className="label-mono mt-6 text-center text-muted-foreground">The interview room · example session</p>
                </m.div>
            </div>
        </section>
    );
}
