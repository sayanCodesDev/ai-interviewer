import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Steps through a scripted animation: stays on step `i` for `durations[i]` ms, then moves to the next. It runs only while
 * `active` (on screen), starts from the first step each time it becomes active, and either stops on the last step or
 * starts over. Under reduced motion it shows the finished state straight away.
 *
 * `durations` must be stable (a module-level constant), or the timers restart on every render.
 */
export function useSequence(durations: readonly number[], active: boolean, { loop = false }: { loop?: boolean } = {}): number {
    const reduce = useReducedMotion() ?? false;
    const last = durations.length - 1;
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (!active) setStep(0);
    }, [active]);

    useEffect(() => {
        if (reduce || !active) return;
        if (step >= last && !loop) return;
        const id = setTimeout(() => setStep((current) => (current >= last ? 0 : current + 1)), durations[step]);
        return () => clearTimeout(id);
    }, [active, step, reduce, loop, last, durations]);

    return reduce ? last : step;
}

/** Reveals `text` a few characters at a time while `active`; the whole text at once under reduced motion. */
export function useTypedText(text: string, active: boolean, charsPerSecond = 38): string {
    const reduce = useReducedMotion() ?? false;
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (reduce) return;
        if (!active) {
            setCount(0);
            return;
        }
        // New text starts from nothing, rather than flashing the new line cut at the old one's length.
        setCount(0);
        let current = 0;
        const id = setInterval(() => {
            current += 1;
            setCount(current);
            if (current >= text.length) clearInterval(id);
        }, 1000 / charsPerSecond);
        return () => clearInterval(id);
    }, [active, text, charsPerSecond, reduce]);

    return reduce ? text : text.slice(0, count);
}
