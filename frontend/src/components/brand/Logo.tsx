import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * Intervyu's mark: an "i" (the interview, the person in it) with its voice going out. On a 32-unit grid; the same
 * shapes are drawn in src/favicon.svg, scripts/make-icons.ts and scripts/make-og-image.ts, so change them together.
 */
export const MARK = {
    tile: { rx: 9 },
    dot: { cx: 10.5, cy: 9.5, r: 2.6 },
    stem: { x: 8.3, y: 14, width: 4.4, height: 11, rx: 2.2 },
    waves: ["M17 12.5a6.5 6.5 0 0 1 0 9", "M21.2 9.3a11 11 0 0 1 0 15.4"],
    waveWidth: 2.6,
} as const;

export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
    return (
        <svg viewBox="0 0 32 32" aria-hidden data-animated={animated} className={cn("logo-mark size-9 shrink-0", className)}>
            <rect width="32" height="32" rx={MARK.tile.rx} fill="#C6F135" />
            <circle {...MARK.dot} fill="#151512" />
            <rect {...MARK.stem} fill="#151512" />
            {MARK.waves.map((d, i) => (
                <path key={d} className={`logo-wave logo-wave-${i + 1}`} d={d} stroke="#151512" strokeWidth={MARK.waveWidth} strokeLinecap="round" fill="none" />
            ))}
        </svg>
    );
}

export function Logo({ to = "/", className, wordmark = true }: { to?: string; className?: string; wordmark?: boolean }) {
    return (
        <Link to={to} aria-label="Intervyu home" className={cn("inline-flex items-center gap-3", className)}>
            <LogoMark />
            {wordmark && <span className="font-serif text-[28px] leading-none tracking-tight">Intervyu</span>}
        </Link>
    );
}
