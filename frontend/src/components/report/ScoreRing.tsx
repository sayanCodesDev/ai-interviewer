import { m, useReducedMotion } from "motion/react";

import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The overall score as a ring that draws in. The number is always in the text, so nothing depends on colour or motion. */
export function ScoreRing({ score, band, className }: { score: number; band: string; className?: string }) {
    const reduce = useReducedMotion();
    const fraction = Math.max(0, Math.min(100, score)) / 100;

    return (
        <div className={cn("relative size-44 shrink-0", className)} role="img" aria-label={`Overall score ${score} out of 100, ${band}`}>
            <svg viewBox="0 0 160 160" className="size-full -rotate-90">
                <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="10" />
                <m.circle
                    cx="80"
                    cy="80"
                    r={RADIUS}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    initial={{ strokeDashoffset: reduce ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE }}
                    animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }}
                    transition={{ duration: reduce ? 0 : 1.2, ease: EASE_OUT_EXPO, delay: 0.15 }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-6xl leading-none tracking-tight tabular-nums">{score}</span>
                <span className="label-mono mt-2 text-muted-foreground">out of 100</span>
            </div>
        </div>
    );
}
