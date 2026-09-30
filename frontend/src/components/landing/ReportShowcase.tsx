import { Check } from "lucide-react";
import { m, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

// An example report. The sections, dimension names and bands are the real report's; the numbers are made up.
const OVERALL = 78;
const DIMENSIONS = [
    { label: "Problem solving", score: 82 },
    { label: "Code correctness", score: 93, note: "from tests" },
    { label: "Code quality", score: 74 },
    { label: "Complexity analysis", score: 61 },
    { label: "Technical depth", score: 79 },
    { label: "Communication", score: 84 },
];
const PLAN = [
    { topic: "Complexity analysis", why: "You found the optimal approach but guessed its cost.", priority: "high" },
    { topic: "Graph traversal", why: "The second problem needed two hints to get to BFS.", priority: "medium" },
    { topic: "Kafka ordering guarantees", why: "Partition keys came up and stayed vague.", priority: "medium" },
];
const TREND = [54, 63, 70, 78];

const CONTENTS = [
    "A score out of 100 and a readiness band",
    "Every skill scored, with the evidence behind it",
    "Round-by-round feedback, and your code against the intended solution",
    "What's working and what to change, quoted from your transcript",
    "A study plan in priority order, with a one-click retry",
    "The full transcript, and your progress over time",
];

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function useCountUp(to: number, run: boolean, ms = 1400) {
    const reduce = useReducedMotion() ?? false;
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (!run || reduce) return;
        const started = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - started) / ms);
            setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [run, to, ms, reduce]);

    return reduce ? to : value;
}

function Trend({ run }: { run: boolean }) {
    const W = 260;
    const H = 72;
    const x = (i: number) => 6 + (i / (TREND.length - 1)) * (W - 12);
    const y = (s: number) => 6 + (1 - (s - 40) / 60) * (H - 12);
    const d = TREND.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[72px] w-full" role="img" aria-label={`Example scores over four interviews: ${TREND.join(", ")}`}>
            <m.path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ pathLength: run ? 1 : 0 }}
                transition={{ duration: 1.2, ease: "easeInOut", delay: 0.6 }}
            />
            {TREND.map((s, i) => (
                <m.circle
                    key={i}
                    cx={x(i)}
                    cy={y(s)}
                    r={i === TREND.length - 1 ? 5 : 3.5}
                    className={i === TREND.length - 1 ? "fill-signal stroke-foreground" : "fill-foreground"}
                    strokeWidth={1.5}
                    initial={false}
                    animate={{ opacity: run ? 1 : 0 }}
                    transition={{ delay: 0.6 + (i / (TREND.length - 1)) * 1.2 }}
                />
            ))}
        </svg>
    );
}

export function ReportShowcase() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
    const reduce = useReducedMotion() ?? false;
    const run = inView || reduce;
    const score = useCountUp(OVERALL, run);

    return (
        <section id="report" className="scroll-mt-16 border-t py-24 sm:py-32">
            <div className="page-container grid gap-14 lg:grid-cols-12 lg:gap-16">
                <div className="lg:col-span-5">
                    <p className="label-mono text-muted-foreground">The report</p>
                    <h2 className="text-h2 mt-4">Know exactly what to practise next.</h2>
                    <p className="text-lede mt-5 max-w-md text-muted-foreground">
                        About a minute after you hang up, you get the feedback a good interviewer would give you if they had the time to write it all down.
                    </p>
                    <ul className="mt-9 grid gap-3.5">
                        {CONTENTS.map((item) => (
                            <li key={item} className="flex gap-3 text-[17px] leading-snug">
                                <Check className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                <div ref={ref} className="lg:col-span-7">
                    <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_40px_80px_-50px_rgba(21,21,18,0.35)]">
                        <div className="flex flex-wrap items-center gap-7 border-b p-6 sm:p-8">
                            <div className="relative size-36 shrink-0" role="img" aria-label={`An example overall score of ${OVERALL} out of 100: Close`}>
                                <svg viewBox="0 0 136 136" className="size-full -rotate-90">
                                    <circle cx="68" cy="68" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="10" />
                                    <m.circle
                                        cx="68"
                                        cy="68"
                                        r={RADIUS}
                                        fill="none"
                                        stroke="var(--foreground)"
                                        strokeWidth="10"
                                        strokeLinecap="round"
                                        strokeDasharray={CIRCUMFERENCE}
                                        initial={false}
                                        animate={{ strokeDashoffset: run ? CIRCUMFERENCE * (1 - OVERALL / 100) : CIRCUMFERENCE }}
                                        transition={{ duration: reduce ? 0 : 1.4, ease: EASE_OUT_EXPO }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="font-serif text-[3.25rem] leading-none tabular-nums">{score}</span>
                                    <span className="label-mono mt-1.5 text-muted-foreground">of 100</span>
                                </div>
                            </div>
                            <div className="min-w-[14rem] flex-1">
                                <p className="label-mono text-muted-foreground">Backend Engineer · example</p>
                                <p className="mt-2 font-serif text-4xl tracking-tight">Close</p>
                                <p className="mt-2 max-w-sm text-[16px] leading-relaxed text-muted-foreground">
                                    Strong on correctness and communication. Complexity is what's holding the score back.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-0 sm:grid-cols-2">
                            <div className="border-b p-6 sm:border-r sm:p-8">
                                <p className="label-mono text-muted-foreground">Skill by skill</p>
                                <ul className="mt-5 grid gap-3.5">
                                    {DIMENSIONS.map((d, index) => (
                                        <li key={d.label}>
                                            <div className="flex items-baseline justify-between gap-3 text-[15px]">
                                                <span>
                                                    {d.label}
                                                    {d.note && <span className="label-mono ml-2 text-muted-foreground">{d.note}</span>}
                                                </span>
                                                <span className="font-mono text-[13.5px] tabular-nums text-muted-foreground">{d.score}</span>
                                            </div>
                                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                                                <m.span
                                                    className="block h-full origin-left rounded-full bg-foreground"
                                                    style={{ width: `${d.score}%` }}
                                                    initial={false}
                                                    animate={{ scaleX: run ? 1 : 0 }}
                                                    transition={{ duration: reduce ? 0 : 0.9, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.2 + index * 0.07 }}
                                                />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="border-b p-6 sm:p-8">
                                <p className="label-mono text-muted-foreground">Where to focus next</p>
                                <p className="mt-4 text-[17px] font-medium">Say the complexity before you code</p>
                                <blockquote className="mt-3 border-l-2 border-signal pl-4 font-serif text-[21px] leading-snug italic">
                                    “I think it's O of n squared? Maybe n log n.”
                                </blockquote>
                                <p className="label-mono mt-3 text-muted-foreground">You, 18:42 · quoted from the transcript</p>

                                <p className="label-mono mt-8 text-muted-foreground">Score over time</p>
                                <div className="mt-2 text-foreground">
                                    <Trend run={run} />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 sm:p-8">
                            <p className="label-mono text-muted-foreground">Your preparation plan</p>
                            <ol className="mt-4 grid gap-2.5">
                                {PLAN.map((item, index) => (
                                    <m.li
                                        key={item.topic}
                                        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3.5"
                                        initial={false}
                                        animate={{ opacity: run ? 1 : 0, y: run ? 0 : 12 }}
                                        transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT_EXPO, delay: reduce ? 0 : 0.9 + index * 0.12 }}
                                    >
                                        <span className="font-mono text-[13px] text-muted-foreground">{index + 1}</span>
                                        <span className="min-w-[13rem] flex-1">
                                            <span className="block text-[16.5px] font-medium">{item.topic}</span>
                                            <span className="block text-[15px] leading-snug text-muted-foreground">{item.why}</span>
                                        </span>
                                        <span
                                            className={cn(
                                                "label-mono rounded-full border px-2.5 py-1",
                                                item.priority === "high" && "border-transparent bg-foreground text-background",
                                            )}
                                        >
                                            {item.priority}
                                        </span>
                                        <span className={cn("rounded-md border px-3 py-1.5 text-[14px] font-medium", index === 0 && "border-transparent bg-signal text-signal-foreground")}>
                                            Practice this
                                        </span>
                                    </m.li>
                                ))}
                            </ol>
                        </div>
                    </div>
                    <p className="label-mono mt-5 text-muted-foreground">An example report · the numbers are illustrative</p>
                </div>
            </div>
        </section>
    );
}
