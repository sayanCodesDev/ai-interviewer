import { m } from "motion/react";

import { FORMAT_CONTENT } from "@/content/roles.generated";
import { EASE_OUT_EXPO, fadeUp, inViewOnce, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Round colours on light surfaces: coding in the accent, the rest in shades of ink, so the shape of each loop reads at a glance. */
const TONE: Record<string, string> = {
    intro: "bg-foreground/15",
    background: "bg-foreground/35",
    coding: "bg-signal",
    technical: "bg-foreground/60",
    system_design: "bg-foreground",
    behavioral: "bg-foreground/35",
    wrapup: "bg-foreground/15",
};

const LEGEND = [
    { tone: TONE.coding!, label: "Coding" },
    { tone: TONE.technical!, label: "Technical" },
    { tone: TONE.system_design!, label: "System design" },
    { tone: TONE.background!, label: "Background and behavioral" },
    { tone: TONE.intro!, label: "Intro and wrap-up" },
];

/** Who each format suits. "Suggested" matches what the setup form picks for your level. */
const FOR: Record<string, string> = {
    quick: "A first screen",
    standard: "Suggested for intern to mid-level",
    full: "Suggested for senior and staff",
    drill: "Pure coding practice",
};

function roundLabel(round: { title: string; count: number; type: string }): string {
    if (round.type === "coding") return `${round.title} · ${round.count} ${round.count === 1 ? "problem" : "problems"}`;
    return round.title;
}

export function Formats() {
    return (
        <section id="formats" className="scroll-mt-16 border-t py-24 sm:py-32">
            <div className="page-container">
                <div className="flex flex-wrap items-end justify-between gap-8">
                    <div className="max-w-2xl">
                        <p className="label-mono text-muted-foreground">Formats</p>
                        <h2 className="text-h2 mt-4">Twenty minutes, or the full loop.</h2>
                        <p className="text-lede mt-5 text-muted-foreground">
                            Each format is timed like the real interview it's modelled on. Intervyu suggests one for your level, and you can always pick another.
                        </p>
                    </div>
                    <ul aria-label="Round types" className="flex max-w-md flex-wrap gap-x-5 gap-y-2">
                        {LEGEND.map((item) => (
                            <li key={item.label} className="flex items-center gap-2 text-[14.5px] text-muted-foreground">
                                <span aria-hidden className={cn("h-2.5 w-5 rounded-full", item.tone)} />
                                {item.label}
                            </li>
                        ))}
                    </ul>
                </div>

                <m.ul
                    className="mt-14 grid gap-4 md:grid-cols-2"
                    variants={stagger(0.1)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    {FORMAT_CONTENT.map((format) => (
                        <m.li key={format.id} variants={fadeUp} className="flex flex-col rounded-2xl border bg-card p-7 sm:p-8">
                            <div className="flex items-baseline justify-between gap-4">
                                <h3 className="text-h3">{format.label}</h3>
                                <p className="font-mono text-[15px] text-muted-foreground">{format.minutes} min</p>
                            </div>
                            <p className="label-mono mt-2 text-muted-foreground">{FOR[format.id]}</p>
                            <p className="mt-4 text-[16.5px] leading-relaxed text-muted-foreground">{format.description}</p>

                            <div className="mt-auto pt-8">
                                <div className="flex h-3 gap-1" aria-hidden>
                                    {format.rounds.map((round, index) => (
                                        <m.span
                                            key={round.type}
                                            className={cn("h-full origin-left rounded-full", TONE[round.type])}
                                            style={{ flexGrow: round.minutes }}
                                            variants={{
                                                hidden: { scaleX: 0 },
                                                visible: { scaleX: 1, transition: { duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.25 + index * 0.08 } },
                                            }}
                                        />
                                    ))}
                                </div>
                                <ol className="mt-5 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
                                    {format.rounds.map((round) => (
                                        <li key={round.type} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1.5">
                                            <span>{roundLabel(round)}</span>
                                            <span className="font-mono text-[13px] text-muted-foreground">{round.minutes}m</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </m.li>
                    ))}
                </m.ul>
                <p className="mt-6 text-[15px] text-muted-foreground">
                    Interns and juniors get a round on concepts and trade-offs in place of system design.
                </p>
            </div>
        </section>
    );
}
