import { FileText, FileUser, Gauge } from "lucide-react";
import { m, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { GithubMark } from "@/components/brand/GithubMark";
import { EASE_OUT_EXPO, fadeUp, inViewOnce, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

type SourceId = "jd" | "resume" | "github" | "level";

/** What each thing you give at setup actually changes. All of it is what the plan builder does with it. */
const SOURCES: ReadonlyArray<{ id: SourceId; label: string; Icon: React.ComponentType<{ className?: string }>; gives: string }> = [
    {
        id: "jd",
        label: "Job description",
        Icon: FileText,
        gives: "Technical questions on the skills it asks for, coding problems on the topics it calls for, and the design prompt. Its vocabulary too, so words like Kafka are heard correctly.",
    },
    { id: "resume", label: "Resume", Icon: FileUser, gives: "Background questions about the work you've actually done, so you talk about your own projects, not hypotheticals." },
    { id: "github", label: "GitHub", Icon: GithubMark, gives: "Questions about the projects you've built, and the editor opens in the language you use most." },
    { id: "level", label: "Your level", Icon: Gauge, gives: "How hard the problems are, the format we suggest, and whether you get a system-design round (mid-level and up)." },
];

const PLAN: ReadonlyArray<{ round: string; detail: string; minutes: number; from: readonly SourceId[] }> = [
    { round: "Introduction", detail: "Who you are and what you're working on", minutes: 3, from: [] },
    { round: "Background", detail: "“Walk me through your webhook service.”", minutes: 6, from: ["github", "resume"] },
    { round: "Coding · 2 problems", detail: "Hash maps, then graphs, harder if you breeze through the first", minutes: 18, from: ["jd", "level"] },
    { round: "Technical", detail: "Postgres indexing, Kafka ordering, idempotency", minutes: 9, from: ["jd", "level"] },
    { round: "Behavioral", detail: "Ownership when an on-call night goes wrong", minutes: 6, from: ["jd"] },
    { round: "Wrap-up", detail: "Your questions for the interviewer", minutes: 3, from: [] },
];

const LABEL: Record<SourceId, string> = { jd: "Job", resume: "Resume", github: "GitHub", level: "Level" };

export function JobFit() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "0px 0px -20% 0px" });
    const reduce = useReducedMotion() ?? false;
    const [selected, setSelected] = useState<SourceId>("jd");
    // It shows each input in turn until the visitor picks one themselves.
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (!inView || touched || reduce) return;
        const id = setInterval(() => {
            setSelected((current) => SOURCES[(SOURCES.findIndex((s) => s.id === current) + 1) % SOURCES.length]!.id);
        }, 2800);
        return () => clearInterval(id);
    }, [inView, touched, reduce]);

    const pick = (id: SourceId) => {
        setTouched(true);
        setSelected(id);
    };

    return (
        <section id="setup" className="scroll-mt-16 border-t py-24 sm:py-32">
            <div ref={ref} className="page-container grid gap-14 lg:grid-cols-12 lg:gap-16">
                <div className="lg:col-span-5">
                    <p className="label-mono text-muted-foreground">Setup</p>
                    <h2 className="text-h2 mt-4">Built from the job you actually want.</h2>
                    <p className="text-lede mt-5 max-w-md text-muted-foreground">
                        Before the interview starts you tell Intervyu what you're preparing for. Every round is planned from it, so a backend role at a
                        payments company feels nothing like a frontend role at an agency.
                    </p>

                    <div role="group" aria-label="What you give at setup" className="mt-10 grid gap-2">
                        {SOURCES.map(({ id, label, Icon, gives }) => {
                            const on = selected === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => pick(id)}
                                    onMouseEnter={() => pick(id)}
                                    onFocus={() => pick(id)}
                                    className={cn(
                                        "group rounded-xl border px-5 py-4 text-left transition-[background-color,border-color] duration-300",
                                        on ? "border-foreground/50 bg-card" : "border-transparent hover:bg-card/60",
                                    )}
                                >
                                    <span className="flex items-center gap-3 text-[17px] font-medium">
                                        <Icon className={cn("size-[18px] transition-colors", on ? "text-foreground" : "text-muted-foreground")} />
                                        {label}
                                    </span>
                                    <span
                                        className={cn(
                                            "grid transition-[grid-template-rows,opacity] duration-500 ease-out-expo",
                                            on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                        )}
                                    >
                                        <span className="min-h-0 overflow-hidden">
                                            <span className="block pt-2 pl-[30px] text-[16px] leading-relaxed text-muted-foreground">{gives}</span>
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <m.div
                    className="lg:col-span-7"
                    variants={stagger(0.07, 0.1)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    <div className="overflow-hidden rounded-2xl border border-night-line bg-night text-night-foreground">
                        <div className="flex items-center justify-between gap-4 border-b border-night-line px-5 py-4 sm:px-7">
                            <div>
                                <p className="label-mono text-night-muted">Your interview · example</p>
                                <p className="mt-1.5 font-serif text-2xl tracking-tight">Backend Engineer · Standard loop</p>
                            </div>
                            <p className="font-mono text-[14px] text-night-muted">45 min</p>
                        </div>

                        <ol className="divide-y divide-night-line">
                            {PLAN.map((row, index) => {
                                const fed = row.from.includes(selected);
                                return (
                                    <m.li key={row.round} variants={fadeUp} className="relative px-5 py-4 sm:px-7">
                                        <m.span
                                            aria-hidden
                                            className="absolute inset-y-0 left-0 w-[3px] origin-top bg-signal"
                                            initial={false}
                                            animate={{ scaleY: fed ? 1 : 0 }}
                                            transition={{ duration: 0.45, ease: EASE_OUT_EXPO, delay: fed ? index * 0.04 : 0 }}
                                        />
                                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                            <span className="font-mono text-[13px] text-night-muted">{String(index + 1).padStart(2, "0")}</span>
                                            <span className="text-[17px] font-medium">{row.round}</span>
                                            <span className="ml-auto font-mono text-[13px] text-night-muted">{row.minutes} min</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 pl-9">
                                            <span className="text-[15px] leading-relaxed text-night-muted">{row.detail}</span>
                                            {row.from.length > 0 && (
                                                <span className="flex gap-1.5">
                                                    {row.from.map((id) => (
                                                        <span
                                                            key={id}
                                                            className={cn(
                                                                "rounded-full border px-2 py-0.5 font-mono text-[11.5px] tracking-wide uppercase transition-colors duration-300",
                                                                id === selected ? "border-transparent bg-signal text-signal-foreground" : "border-night-line text-night-muted",
                                                            )}
                                                        >
                                                            {LABEL[id]}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </div>
                                    </m.li>
                                );
                            })}
                        </ol>
                    </div>
                    <p className="label-mono mt-5 text-muted-foreground">Hover or tap an input to see which rounds it shapes</p>
                </m.div>
            </div>
        </section>
    );
}
