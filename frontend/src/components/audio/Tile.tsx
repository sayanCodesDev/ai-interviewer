import { type MotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Waveform } from "@/components/audio/Waveform";
import { cn } from "@/lib/utils";

/** True while `level` is above the threshold, holding briefly through pauses so the UI doesn't flicker. */
export function useSpeaking(level: MotionValue<number>, threshold = 0.1, holdMs = 450) {
    const [speaking, setSpeaking] = useState(false);
    const on = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useMotionValueEvent(level, "change", (value) => {
        if (value > threshold) {
            clearTimeout(timer.current);
            timer.current = undefined;
            if (!on.current) {
                on.current = true;
                setSpeaking(true);
            }
        } else if (on.current && timer.current === undefined) {
            timer.current = setTimeout(() => {
                on.current = false;
                timer.current = undefined;
                setSpeaking(false);
            }, holdMs);
        }
    });

    useEffect(() => () => clearTimeout(timer.current), []);

    return speaking;
}

interface TileProps {
    kind: "ai" | "user";
    label: string;
    level: MotionValue<number>;
    initials?: string;
    muted?: boolean;
    connecting?: boolean;
    /** The interviewer is working out what to say. */
    thinking?: boolean;
    /** Collapse to a small tile (avatar hidden) when the code editor takes the stage. */
    compact?: boolean;
    className?: string;
}

/** One participant in the interview room. Fixed dark palette so it looks the same in the landing page demo. */
export function Tile({ kind, label, level, initials, muted = false, connecting = false, thinking = false, compact = false, className }: TileProps) {
    const heard = useSpeaking(level);
    const speaking = heard && !muted && !connecting;

    const status = connecting ? "Connecting" : muted ? "Muted" : speaking ? "Speaking" : thinking ? "Thinking" : "Listening";

    return (
        <div
            data-speaking={speaking}
            className={cn(
                "@container relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-night-raised text-night-foreground transition-colors duration-500",
                speaking ? "border-signal/60" : "border-night-line",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
                <span className="truncate text-[13px] font-medium">{label}</span>
                <span className="label-mono flex shrink-0 items-center gap-1.5 text-night-muted">
                    <span
                        className={cn(
                            "size-1.5 rounded-full transition-colors duration-300",
                            (connecting || (thinking && !speaking)) && "animate-live bg-night-amber",
                            !connecting && muted && "bg-night-red",
                            !connecting && !muted && speaking && "animate-live bg-signal",
                            !connecting && !muted && !speaking && !thinking && "bg-night-muted/50",
                        )}
                    />
                    <span className="hidden @[13rem]:inline">{status}</span>
                </span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-5 py-4">
                <div
                    className={cn(
                        "grid w-full justify-items-center transition-[grid-template-rows,opacity] duration-700 ease-out-expo",
                        compact ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                    )}
                >
                    <div className="min-h-0 overflow-hidden p-1.5">
                        <div
                            className={cn(
                                "flex size-[72px] items-center justify-center rounded-full border text-2xl transition-shadow duration-500 @[26rem]:size-24 @[26rem]:text-4xl",
                                kind === "ai" ? "font-serif italic" : "font-serif",
                                speaking
                                    ? "border-signal/60 shadow-[0_0_0_4px_var(--night-raised),0_0_0_5px_color-mix(in_oklab,var(--signal)_45%,transparent)]"
                                    : "border-night-line",
                            )}
                        >
                            {kind === "ai" ? "AI" : initials || "You"}
                        </div>
                    </div>
                </div>

                <div
                    className={cn(
                        "w-full max-w-72 transition-[height,margin,color] duration-700 ease-out-expo",
                        compact ? "mt-1 h-8" : "mt-4 h-14 @[26rem]:mt-6 @[26rem]:h-20",
                        speaking ? "text-signal" : "text-night-muted/60",
                    )}
                >
                    <Waveform level={level} />
                </div>
            </div>
        </div>
    );
}
