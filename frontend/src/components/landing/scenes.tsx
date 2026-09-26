import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { Tile } from "@/components/audio/Tile";
import { Waveform } from "@/components/audio/Waveform";
import { CODE_LENGTH } from "@/components/landing/MiniEditor";
import { EditorPane, ProblemCard } from "@/components/landing/ProductWindow";
import { useSimulatedLevel } from "@/hooks/useSimulatedLevel";

/** Static pictures of each stage of an interview, drawn in the fixed dark palette. */

export function SetupScene() {
    return (
        <div className="flex h-full flex-col justify-center gap-6 p-6 sm:p-10">
            <div>
                <p className="label-mono text-night-muted">Interview setup</p>
                <h3 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Set up your interview.</h3>
            </div>
            <div className="grid max-w-md gap-5">
                <div>
                    <p className="text-[13px] font-medium">Target role</p>
                    <div className="mt-2 flex h-11 items-center justify-between rounded-md border border-night-line bg-night-raised px-3.5 text-[15px]">
                        Frontend Engineer
                        <ChevronDown className="size-4 text-night-muted" />
                    </div>
                </div>
                <div>
                    <p className="text-[13px] font-medium">GitHub profile (optional)</p>
                    <div className="mt-2 flex h-11 items-center rounded-md border border-night-line bg-night-raised px-3.5 text-[15px] text-night-foreground/90">
                        https://github.com/ada-lovelace
                    </div>
                </div>
                <div className="mt-1 w-fit rounded-md bg-signal px-5 py-3 text-[15px] font-medium text-signal-foreground">Start interview</div>
            </div>
        </div>
    );
}

export function TalkScene() {
    const [turn, setTurn] = useState<"ai" | "user">("ai");

    useEffect(() => {
        const id = setInterval(() => setTurn((current) => (current === "ai" ? "user" : "ai")), 3400);
        return () => clearInterval(id);
    }, []);

    const aiLevel = useSimulatedLevel(turn === "ai", 2);
    const userLevel = useSimulatedLevel(turn === "user", 9);

    return (
        <div className="grid h-full grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            <Tile kind="ai" label="Interviewer" level={aiLevel} />
            <Tile kind="user" label="You" level={userLevel} initials="AL" />
        </div>
    );
}

export function CodeScene() {
    const silent = useSimulatedLevel(false);

    return (
        <div className="grid h-full gap-3 p-3 md:grid-cols-[0.42fr_1fr]">
            <div className="hidden min-h-0 grid-rows-[auto_1fr] gap-3 md:grid">
                <div className="grid grid-cols-2 gap-3">
                    <Tile kind="ai" label="AI" level={silent} compact />
                    <Tile kind="user" label="You" level={silent} initials="AL" compact />
                </div>
                <div className="min-h-0 overflow-hidden">
                    <ProblemCard visible />
                </div>
            </div>
            <div className="min-h-0">
                <EditorPane count={CODE_LENGTH} phase="run" />
            </div>
        </div>
    );
}

export function FeedbackScene() {
    const level = useSimulatedLevel(true, 4);

    return (
        <div className="flex h-full flex-col justify-center gap-8 p-6 sm:p-10">
            <div className="h-16 text-signal">
                <Waveform level={level} />
            </div>
            <div>
                <p className="label-mono text-night-muted">Wrap-up · example</p>
                <blockquote className="mt-4 font-serif text-2xl leading-snug tracking-tight italic sm:text-[32px]">
                    “Clean approach, and good instincts on the follow-ups. Next time, say your edge cases out loud before you start typing.”
                </blockquote>
            </div>
        </div>
    );
}
