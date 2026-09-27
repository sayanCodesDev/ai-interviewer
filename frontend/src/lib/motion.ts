import type { Variants } from "motion/react";

/** Shared easing so every animation in the app decelerates the same way. */
export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

export const DURATION = { fast: 0.15, base: 0.3, slow: 0.6, hero: 0.9 } as const;

export const fadeUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT_EXPO } },
};

export const fade: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: DURATION.slow, ease: EASE_OUT_EXPO } },
};

export function stagger(staggerChildren = 0.08, delayChildren = 0): Variants {
    return { hidden: {}, visible: { transition: { staggerChildren, delayChildren } } };
}

/** Reveal once when roughly the top 12% of the element has entered the viewport. */
export const inViewOnce = { once: true, margin: "0px 0px -12% 0px" } as const;
