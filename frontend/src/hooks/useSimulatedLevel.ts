import { useAnimationFrame, useMotionValue, useReducedMotion } from "motion/react";

/**
 * A speech-like audio level (0..1) for demo visuals on the marketing page.
 * Stays at zero while inactive and holds a steady mid level under reduced motion.
 */
export function useSimulatedLevel(active: boolean, seed = 0) {
    const level = useMotionValue(0);
    const reduceMotion = useReducedMotion();

    useAnimationFrame((time) => {
        if (!active) {
            if (level.get() !== 0) level.set(0);
            return;
        }
        if (reduceMotion) {
            level.set(0.5);
            return;
        }
        const s = time / 1000 + seed;
        const phrase = 0.5 + 0.5 * Math.sin(s * 1.7);
        const syllable = 0.5 + 0.5 * Math.sin(s * 9.3) * Math.sin(s * 5.1 + 1);
        const gate = phrase > 0.16 ? 1 : 0.1;
        level.set(Math.min(1, gate * (0.25 + 0.75 * syllable) * (0.55 + 0.45 * phrase)));
    });

    return level;
}
