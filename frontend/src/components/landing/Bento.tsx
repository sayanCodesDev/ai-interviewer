import { m } from "motion/react";
import { useEffect, useState } from "react";

import { Waveform } from "@/components/audio/Waveform";
import { MiniEditor } from "@/components/landing/MiniEditor";
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
            <p className={cn("label-mono", tone === "card" ? "text-muted-foreground" : tone === "night" ? "text-night-muted" : "opacity-60")}>{eyebrow}</p>
            <h3 className="text-h3 mt-4">{title}</h3>
            <p className={cn("mt-3 max-w-md text-[15px] leading-relaxed", tone === "card" ? "text-muted-foreground" : tone === "night" ? "text-night-muted" : "opacity-75")}>
                {text}
            </p>
            {children && <div className="mt-8 flex flex-1 flex-col justify-end">{children}</div>}
        </m.article>
    );
}

function VoiceVisual() {
    const level = useSimulatedLevel(true, 5);
    return (
        <div className="h-24 text-signal">
            <Waveform level={level} maxBars={90} />
        </div>
    );
}

function LanguagesVisual() {
    const languages = ["JavaScript", "TypeScript", "Python", "C++", "Java"];
    const [active, setActive] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setActive((current) => (current + 1) % languages.length), 1600);
        return () => clearInterval(id);
    }, [languages.length]);

    return (
        <div className="flex flex-wrap gap-2">
            {languages.map((language, index) => (
                <span
                    key={language}
                    className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-500",
                        index === active ? "border-transparent bg-foreground text-background" : "text-muted-foreground",
                    )}
                >
                    {language}
                </span>
            ))}
        </div>
    );
}

function GithubVisual() {
    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
                {["React", "Node.js", "PostgreSQL", "Docker"].map((tag) => (
                    <span key={tag} className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
                        {tag}
                    </span>
                ))}
            </div>
            <p className="rounded-xl rounded-tl-sm bg-foreground px-4 py-3 text-sm leading-relaxed text-background">
                Where did caching help most in your API?
            </p>
            <p className="label-mono text-muted-foreground">Example question</p>
        </div>
    );
}

export function Bento() {
    return (
        <section id="features" className="scroll-mt-16 py-24 sm:py-32">
            <div className="page-container">
                <div className="max-w-2xl">
                    <p className="label-mono text-muted-foreground">Features</p>
                    <h2 className="text-h2 mt-4">Built like the real thing.</h2>
                </div>

                <m.div
                    className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-12"
                    variants={stagger(0.09)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    <TileShell
                        tone="night"
                        eyebrow="Voice"
                        title="Talk it through."
                        text="The interviewer speaks and listens in real time. Answer out loud, the way you would in a real round."
                        className="md:col-span-2 lg:col-span-7 lg:min-h-[340px]"
                    >
                        <VoiceVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Editor"
                        title="Then write it."
                        text="When a problem comes up, a full code editor opens beside the conversation. Run your code, then submit it for review."
                        className="md:col-span-2 lg:col-span-5"
                    >
                        <div className="overflow-hidden rounded-xl border border-night-line bg-night-sunken px-4 py-4">
                            <MiniEditor showCaret={false} />
                        </div>
                    </TileShell>

                    <TileShell
                        eyebrow="GitHub"
                        title="Built from your job."
                        text="Paste the job description and the questions follow it. Add your resume or GitHub and the interviewer asks about what you've actually built."
                        className="lg:col-span-5"
                    >
                        <GithubVisual />
                    </TileShell>

                    <TileShell
                        eyebrow="Languages"
                        title="Five languages."
                        text="Switch languages from the editor whenever you like; each keeps its own draft."
                        className="lg:col-span-3"
                    >
                        <LanguagesVisual />
                    </TileShell>

                    <TileShell
                        tone="signal"
                        eyebrow="Report"
                        title="A report you can act on."
                        text="A score out of 100, feedback on every part, the full transcript and a study plan, each point tied to something you said."
                        className="md:col-span-2 lg:col-span-4"
                    >
                        <p className="font-serif text-2xl leading-snug tracking-tight italic">“Say your edge cases out loud before you start typing.”</p>
                        <p className="label-mono mt-4 opacity-60">Example</p>
                    </TileShell>
                </m.div>
            </div>
        </section>
    );
}
