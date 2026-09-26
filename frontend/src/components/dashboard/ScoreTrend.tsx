import type { InterviewListItem } from "@/lib/types";

/** Scores of finished interviews over time, oldest to newest. Drawn as plain SVG: no chart library for one line. */
export function ScoreTrend({ items }: { items: InterviewListItem[] }) {
    const points = items
        .filter((i) => i.score !== null)
        .map((i) => ({ score: i.score as number, at: new Date(i.createdAt) }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (points.length < 2) return null;

    const W = 640;
    const H = 150;
    const pad = { l: 32, r: 12, t: 12, b: 24 };
    const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
    const y = (score: number) => pad.t + (1 - score / 100) * (H - pad.t - pad.b);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const change = last.score - first.score;

    return (
        <figure className="rounded-xl border bg-card p-6">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="label-mono text-muted-foreground">Score over time</span>
                <span className="text-sm text-muted-foreground">
                    {change === 0 ? "No change since your first interview" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} points since your first interview`}
                </span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={`Scores over ${points.length} interviews: ${points.map((p) => p.score).join(", ")}`}>
                {[0, 50, 100].map((tick) => (
                    <g key={tick}>
                        <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === 50 ? "3 5" : undefined} />
                        <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">{tick}</text>
                    </g>
                ))}
                <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => (
                    <circle key={i} cx={x(i)} cy={y(p.score)} r={i === points.length - 1 ? 5 : 3.5} fill={i === points.length - 1 ? "var(--signal)" : "var(--card)"} stroke="var(--foreground)" strokeWidth="2" />
                ))}
                <text x={pad.l} y={H - 4} fontSize="10" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">{first.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
                <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">{last.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>
            </svg>
        </figure>
    );
}
