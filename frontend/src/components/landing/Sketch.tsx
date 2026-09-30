import { m, useReducedMotion } from "motion/react";
import rough from "roughjs";

import { cn } from "@/lib/utils";

/**
 * A hand-drawn system-design diagram, drawn stroke by stroke like someone sketching on the interview room's whiteboard
 * (the real one is Excalidraw; this uses the same rough.js strokes and Excalidraw's own font). Every shape is generated
 * from a fixed seed, so the prerendered HTML and the browser draw exactly the same lines.
 */

type Point = readonly [number, number];

export type SketchElement =
    | { kind: "box"; x: number; y: number; w: number; h: number; label: string; accent?: boolean }
    | { kind: "db"; x: number; y: number; w: number; h: number; label: string }
    | { kind: "arrow"; from: Point; to: Point; bend?: number; label?: string; labelAt?: Point }
    | { kind: "note"; x: number; y: number; text: string };

const generator = rough.generator();
const BASE = { roughness: 1.15, bowing: 1.1, strokeWidth: 1.7, disableMultiStroke: false } as const;

interface Stroke {
    d: string;
    /** Hachure fill lines: faded in rather than drawn, as Excalidraw's fill appears. */
    fill?: boolean;
}

function pathsOf(drawable: ReturnType<typeof generator.rectangle>): Stroke[] {
    return generator.toPaths(drawable).map((p) => ({ d: p.d }));
}

function strokesFor(element: SketchElement, seed: number): { strokes: Stroke[]; fills: Stroke[] } {
    const options = { ...BASE, seed };
    switch (element.kind) {
        case "box": {
            const shape = generator.rectangle(element.x, element.y, element.w, element.h, options);
            const fills = element.accent
                ? pathsOf(generator.rectangle(element.x + 3, element.y + 3, element.w - 6, element.h - 6, { ...options, stroke: "none", fill: "currentColor", fillStyle: "hachure", hachureGap: 8, hachureAngle: -41, fillWeight: 1.2 })).map((p) => ({ ...p, fill: true }))
                : [];
            return { strokes: pathsOf(shape), fills };
        }
        case "db": {
            const ry = Math.min(12, element.h / 6);
            const cx = element.x + element.w / 2;
            const top = generator.ellipse(cx, element.y + ry, element.w, ry * 2, options);
            const left = generator.line(element.x, element.y + ry, element.x, element.y + element.h - ry, { ...options, seed: seed + 1 });
            const right = generator.line(element.x + element.w, element.y + ry, element.x + element.w, element.y + element.h - ry, { ...options, seed: seed + 2 });
            const bottom = generator.arc(cx, element.y + element.h - ry, element.w, ry * 2, 0, Math.PI, false, { ...options, seed: seed + 3 });
            return { strokes: [top, left, right, bottom].flatMap((shape) => pathsOf(shape)), fills: [] };
        }
        case "arrow": {
            const [x1, y1] = element.from;
            const [x2, y2] = element.to;
            const bend = element.bend ?? 0;
            const mx = (x1 + x2) / 2 - (y2 - y1) * bend;
            const my = (y1 + y2) / 2 + (x2 - x1) * bend;
            const shaft = bend ? generator.curve([[x1, y1], [mx, my], [x2, y2]], options) : generator.line(x1, y1, x2, y2, options);
            // The head points along the last stretch of the shaft.
            const angle = Math.atan2(y2 - (bend ? my : y1), x2 - (bend ? mx : x1));
            const head = (turn: number, s: number) =>
                generator.line(x2, y2, x2 - 11 * Math.cos(angle + turn), y2 - 11 * Math.sin(angle + turn), { ...options, seed: s, roughness: 0.8 });
            return { strokes: [shaft, head(0.45, seed + 1), head(-0.45, seed + 2)].flatMap((shape) => pathsOf(shape)), fills: [] };
        }
        case "note":
            return { strokes: [], fills: [] };
    }
}

function labelOf(element: SketchElement): { x: number; y: number; text: string; size: number } | null {
    switch (element.kind) {
        case "box":
            return { x: element.x + element.w / 2, y: element.y + element.h / 2 + 6, text: element.label, size: 17 };
        case "db":
            return { x: element.x + element.w / 2, y: element.y + element.h / 2 + 12, text: element.label, size: 17 };
        case "arrow":
            return element.label && element.labelAt ? { x: element.labelAt[0], y: element.labelAt[1], text: element.label, size: 14 } : null;
        case "note":
            return { x: element.x, y: element.y, text: element.text, size: 14 };
    }
}

interface SketchProps {
    elements: readonly SketchElement[];
    viewBox: string;
    /** Draws the diagram in while true; shows nothing (ready to draw) while false. */
    play: boolean;
    /** Seconds between one element starting and the next. */
    pace?: number;
    className?: string;
    title: string;
}

export function Sketch({ elements, viewBox, play, pace = 0.32, className, title }: SketchProps) {
    const reduce = useReducedMotion() ?? false;

    return (
        <svg viewBox={viewBox} role="img" aria-label={title} className={cn("h-full w-full", className)} fill="none">
            {elements.map((element, index) => {
                const { strokes, fills } = strokesFor(element, 11 + index * 7);
                const label = labelOf(element);
                const delay = reduce ? 0 : index * pace;
                const duration = reduce ? 0 : element.kind === "arrow" ? 0.35 : 0.55;
                const state = play ? "drawn" : "hidden";

                return (
                    <g key={index}>
                        {fills.map((fill, i) => (
                            <m.path
                                key={`f${i}`}
                                d={fill.d}
                                className="stroke-signal"
                                strokeWidth={1.4}
                                strokeLinecap="round"
                                initial={false}
                                animate={state}
                                variants={{ hidden: { opacity: 0 }, drawn: { opacity: 0.5, transition: { delay: delay + duration * 0.8, duration: reduce ? 0 : 0.4 } } }}
                            />
                        ))}
                        {strokes.map((stroke, i) => (
                            <m.path
                                key={`s${i}`}
                                d={stroke.d}
                                stroke="currentColor"
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={false}
                                animate={state}
                                variants={{
                                    hidden: { pathLength: 0, opacity: 0 },
                                    drawn: { pathLength: 1, opacity: 1, transition: { delay: delay + i * 0.04, duration, ease: "easeInOut" } },
                                }}
                            />
                        ))}
                        {label && (
                            <m.text
                                x={label.x}
                                y={label.y}
                                textAnchor={element.kind === "note" ? "start" : "middle"}
                                fill="currentColor"
                                style={{ fontFamily: "Excalifont, var(--font-serif)", fontSize: label.size }}
                                initial={false}
                                animate={state}
                                variants={{ hidden: { opacity: 0 }, drawn: { opacity: element.kind === "note" ? 0.7 : 1, transition: { delay: delay + duration * 0.7, duration: reduce ? 0 : 0.35 } } }}
                            >
                                {label.text}
                            </m.text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

/** A webhook-delivery design: the kind of diagram a candidate sketches when asked to scale a real service. */
export const WEBHOOK_DESIGN: readonly SketchElement[] = [
    { kind: "box", x: 18, y: 126, w: 92, h: 50, label: "Stripe" },
    { kind: "arrow", from: [114, 151], to: [154, 151] },
    { kind: "box", x: 158, y: 126, w: 92, h: 50, label: "API", accent: true },
    { kind: "arrow", from: [254, 151], to: [294, 151] },
    { kind: "box", x: 298, y: 126, w: 92, h: 50, label: "Queue" },
    { kind: "arrow", from: [394, 151], to: [434, 151] },
    { kind: "box", x: 438, y: 126, w: 104, h: 50, label: "Workers" },
    { kind: "arrow", from: [490, 180], to: [490, 222] },
    { kind: "db", x: 440, y: 226, w: 100, h: 66, label: "Postgres" },
    { kind: "arrow", from: [490, 122], to: [490, 80] },
    { kind: "box", x: 430, y: 24, w: 120, h: 52, label: "Redis" },
    { kind: "note", x: 274, y: 54, text: "idempotency keys" },
    // A loop under the queue: failed deliveries go back on it. rough.js curves pass through the middle point.
    { kind: "arrow", from: [372, 180], to: [318, 180], bend: -0.6, label: "retry + backoff", labelAt: [345, 240] },
];

export const WEBHOOK_VIEWBOX = "0 0 560 300";
