import { m, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Waveform } from "@/components/audio/Waveform";
import { useSequence, useTypedText } from "@/hooks/useSequence";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";
import { fadeUp, inViewOnce, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface TileShellProps {
    eyebrow: string;
    title: string;
    text: string;
    tone?: "card" | "night" | "signal";
    className?: string;
    children?: React.ReactNode;
}

function TileShell({ eyebrow, title, text, tone = "card", className, children }: TileShellProps) {
    return (
        <m.article
            variants={fadeUp}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border p-7 transition-colors duration-300 sm:p-8",
                tone === "card" && "bg-card hover:border-foreground/40",
                tone === "night" && "border-night-line bg-night text-night-foreground",
                tone === "signal" && "border-transparent bg-signal text-signal-foreground",
                className,
            )}
        >
            <p className={cn("label-mono", tone === "card" ? "text-muted-foreground" : tone === "night" ? "text-night-muted" : "opacity-75")}>{eyebrow}</p>
            <h3 className="text-h3 mt-4">{title}</h3>
            <p className={cn("mt-3 max-w-md text-[17px] leading-relaxed", tone === "card" ? "text-muted-foreground" : tone === "night" ? "text-night-muted" : "opacity-75")}>
                {text}
            </p>
            {children && <div className="mt-8 flex flex-1 flex-col justify-end">{children}</div>}
        </m.article>
    );
}

/** Plays while the tile is on screen. */
function useOnScreen<T extends Element>() {
    const ref = useRef<T>(null);
    const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
    return [ref, inView] as const;
}

const LISTEN_STATES = [
    { label: "You're answering", note: "It waits for you to finish your thought, even through a pause." },
    { label: "You cut in", note: "It stops talking and listens." },
    { label: "It follows up", note: "“You said the queue retries. What stops a double charge?”" },
] as const;
const LISTEN_STEPS = [3400, 2600, 3600] as const;

function ListensVisual() {
    const [ref, inView] = useOnScreen<HTMLDivElement>();
    const step = useSequence(LISTEN_STEPS, inView, { loop: true });
    const level = useSimulatedLevel(inView && step !== 1, step === 2 ? 3 : 8);
    const state = LISTEN_STATES[step]!;

    return (
        <div ref={ref} className="grid gap-5">
            <div className="h-20 text-signal">
                <Waveform level={level} maxBars={90} />
            </div>
            <div className="min-h-[4.5rem] border-t border-night-line pt-4">
                <p className="label-mono text-night-muted">{state.label}</p>
                <p className="mt-2 text-[16px] leading-snug text-night-foreground/90">{state.note}</p>
            </div>
        </div>
    );
}

const OUTCOMES = [
    { result: "Solved cleanly, no hints", next: "Harder", mark: "↑" },
    { result: "Solved with a hint or two", next: "Same level", mark: "→" },
    { result: "Couldn't finish it", next: "Easier", mark: "↓" },
] as const;
const ADAPT_STEPS = [2400, 2400, 2400] as const;

function AdaptVisual() {
    const [ref, inView] = useOnScreen<HTMLUListElement>();
    const step = useSequence(ADAPT_STEPS, inView, { loop: true });

    return (
        <ul ref={ref} className="grid gap-2">
            {OUTCOMES.map((outcome, index) => (
                <li
                    key={outcome.result}
                    className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-[15.5px] transition-[background-color,border-color,color] duration-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                        index === step ? "border-foreground/40 bg-background text-foreground" : "border-border text-muted-foreground",
                    )}
                >
                    <span>{outcome.result}</span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-[13px] uppercase">
                        next problem <span className={cn("font-sans text-[15px]", index === step && "text-foreground")}>{outcome.mark}</span> {outcome.next}
                    </span>
                </li>
            ))}
        </ul>
    );
}

const HINTS = [
    "What would you need to remember about the numbers you've already seen?",
    "A hash map gives you constant-time lookups.",
    "For each number, check whether the target minus it is already in the map.",
];
// One more hint is revealed at each step; the last step shows them all for a moment before starting over.
const HINT_STEPS = [1800, 1800, 1800, 3600] as const;

function HintsVisual() {
    const [ref, inView] = useOnScreen<HTMLOListElement>();
    const step = useSequence(HINT_STEPS, inView, { loop: true });
    const revealed = Math.min(HINTS.length, step + 1);

    return (
        <ol ref={ref} className="grid gap-2">
            {HINTS.map((hint, index) => {
                const shown = index < revealed;
                return (
                    <li
                        key={hint}
                        className={cn(
                            "flex gap-3 rounded-xl border px-4 py-3 text-[15px] leading-snug transition-colors duration-500",
                            shown ? "bg-background" : "border-dashed",
                        )}
                    >
                        <span className="font-mono text-[13px] text-muted-foreground">{index + 1}</span>
                        {shown ? hint : <span className="text-muted-foreground">Hint {index + 1}, when you ask for it</span>}
                    </li>
                );
            })}
        </ol>
    );
}

const TYPED_ANSWER = "O of n time and O of n space, one pass with a hash map.";

function TalkOrTypeVisual() {
    const [ref, inView] = useOnScreen<HTMLDivElement>();
    const typed = useTypedText(TYPED_ANSWER, inView, 24);

    return (
        <div ref={ref} className="grid gap-3">
            <div className="rounded-xl border bg-background px-4 py-3 text-[15px]">
                <span className="label-mono mb-1.5 block text-muted-foreground">Type instead</span>
                {typed}
                <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-blink bg-foreground" />
            </div>
            <p className="text-[14.5px] text-muted-foreground">A choice of interviewer voices and accents, with live captions</p>
        </div>
    );
}

function LanguagesVisual() {
    const languages = ["JavaScript", "TypeScript", "Python", "C++", "Java"];
    const [ref, inView] = useOnScreen<HTMLDivElement>();
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!inView) return;
        const id = setInterval(() => setActive((current) => (current + 1) % languages.length), 1600);
        return () => clearInterval(id);
    }, [inView, languages.length]);

    return (
        <div ref={ref} className="flex flex-wrap gap-2">
            {languages.map((language, index) => (
                <span
                    key={language}
                    className={cn(
                        "rounded-full border px-4 py-1.5 text-[15px] transition-colors duration-500",
                        index === active ? "border-transparent bg-foreground text-background" : "text-muted-foreground",
                    )}
                >
                    {language}
                </span>
            ))}
        </div>
    );
}

function ReconnectVisual() {
    const [ref, inView] = useOnScreen<HTMLDivElement>();
    const [left, setLeft] = useState(90);

    useEffect(() => {
        if (!inView) return;
        const id = setInterval(() => setLeft((current) => (current <= 62 ? 90 : current - 1)), 1000);
        return () => clearInterval(id);
    }, [inView]);

    return (
        <div ref={ref} className="flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3">
            <span className="flex items-center gap-2.5 text-[15px]">
                <span className="size-2 animate-live rounded-full bg-night-amber" />
                Holding your place
            </span>
            <span className="font-mono text-[15px] tabular-nums text-muted-foreground">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
        </div>
    );
}

export function Bento() {
    return (
        <section id="features" className="scroll-mt-16 border-t py-24 sm:py-32">
            <div className="page-container">
                <div className="max-w-3xl">
                    <p className="label-mono text-muted-foreground">Features</p>
                    <h2 className="text-h2 mt-4">An interview that feels like the real thing.</h2>
                    <p className="text-lede mt-5 max-w-2xl text-muted-foreground">
                        Not a chatbot with a timer. A conductor runs the rounds, the interviewer listens and follows up, and the difficulty moves with
                        you, the way a good interviewer does.
                    </p>
                </div>

                <m.div
                    className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-12"
                    variants={stagger(0.08)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    <TileShell
                        tone="night"
                        eyebrow="Conversation"
                        title="It listens like a person."
                        text="Speak naturally. It waits out a thinking pause, stops when you cut in, and asks about what you actually said instead of reading from a list."
                        className="md:col-span-2 lg:col-span-7 lg:min-h-[400px]"
                    >
                        <ListensVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Difficulty"
                        title="It adapts as you go."
                        text="Each coding problem is chosen from how the last one went, still on the topics your job calls for."
                        className="md:col-span-2 lg:col-span-5"
                    >
                        <AdaptVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Hints"
                        title="Hints, not answers."
                        text="Stuck? Ask. Three hints, each a little more direct, and the report counts how many you needed."
                        className="lg:col-span-4"
                    >
                        <HintsVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Your way"
                        title="Talk, or type."
                        text="Answer out loud or type when you'd rather not. Pick the interviewer's voice and your accent so you're understood."
                        className="lg:col-span-4"
                    >
                        <TalkOrTypeVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Editor"
                        title="Code in your language."
                        text="JavaScript, TypeScript, Python, C++ or Java, with starter code for each. Run the examples or your own input, and every language keeps its own draft."
                        className="md:col-span-2 lg:col-span-4"
                    >
                        <LanguagesVisual />
                    </TileShell>

                    <TileShell
                        tone="signal"
                        eyebrow="Report"
                        title="Feedback with receipts."
                        text="Every strength and every gap is backed by a quote from your own transcript, checked to be real. The overall score is computed, not written by a model."
                        className="md:col-span-2 lg:col-span-5"
                    >
                        <blockquote className="font-serif text-[26px] leading-snug tracking-tight italic">“I'd use a hash map, so it's one pass.”</blockquote>
                        <p className="label-mono mt-4 opacity-75">Quoted in a report · example</p>
                    </TileShell>

                    <TileShell
                        eyebrow="Reliability"
                        title="It waits if you drop."
                        text="Lose your connection and the interview holds your place for 90 seconds, then picks up where you left off."
                        className="lg:col-span-4"
                    >
                        <ReconnectVisual />
                    </TileShell>

                    <TileShell
                        tone="night"
                        eyebrow="Privacy"
                        title="Private by default."
                        text="Your voice is never recorded. Delete any interview, or your whole account, whenever you like."
                        className="lg:col-span-3"
                    />
                </m.div>
            </div>
        </section>
    );
}
