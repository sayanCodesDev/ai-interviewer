import { type MotionValue, useAnimationFrame, useSpring } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface WaveformProps {
    /** Audio level from 0 to 1. Written to outside React, so the bars never trigger a re-render. */
    level: MotionValue<number>;
    className?: string;
    barWidth?: number;
    gap?: number;
    maxBars?: number;
}

/** A row of bars, as many as fit the container, whose heights follow `level`. Colour comes from `currentColor`. */
export function Waveform({ level, className, barWidth = 3, gap = 3, maxBars = 64 }: WaveformProps) {
    const container = useRef<HTMLDivElement>(null);
    const bars = useRef<Array<HTMLSpanElement | null>>([]);
    const [count, setCount] = useState(24);
    const countRef = useRef(count);
    const smoothed = useSpring(level, { stiffness: 320, damping: 32, mass: 0.5 });
    const idle = useRef(false);

    useLayoutEffect(() => {
        const element = container.current;
        if (!element) return;

        const measure = () => {
            const fit = Math.floor((element.clientWidth + gap) / (barWidth + gap));
            const next = Math.max(6, Math.min(maxBars, fit));
            countRef.current = next;
            idle.current = false;
            setCount(next);
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [barWidth, gap, maxBars]);

    useAnimationFrame((time) => {
        const value = smoothed.get();

        if (value < 0.004) {
            if (idle.current) return;
            idle.current = true;
        } else {
            idle.current = false;
        }

        const total = countRef.current;
        for (let i = 0; i < total; i++) {
            const bar = bars.current[i];
            if (!bar) continue;
            const x = total > 1 ? i / (total - 1) : 0.5;
            const envelope = Math.pow(Math.sin(Math.PI * x), 1.15);
            const wobble = 0.5 + 0.5 * Math.sin(time / 130 + i * 0.85) * Math.sin(time / 290 + i * 0.41);
            const height = 0.07 + value * envelope * (0.35 + 0.65 * wobble) * 0.93;
            bar.style.transform = `scaleY(${height.toFixed(3)})`;
        }
    });

    return (
        <div ref={container} aria-hidden className={cn("flex h-full w-full items-center justify-center", className)} style={{ gap }}>
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    ref={(element) => {
                        bars.current[i] = element;
                    }}
                    className="h-full shrink-0 origin-center rounded-full bg-current"
                    style={{ width: barWidth, transform: "scaleY(0.07)" }}
                />
            ))}
        </div>
    );
}
