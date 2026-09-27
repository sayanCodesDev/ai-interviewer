import { formatInputs, formatValue } from "@/lib/format";
import type { PublicProblem } from "@/lib/types";
import { cn } from "@/lib/utils";

const DIFFICULTY_STYLE: Record<PublicProblem["difficulty"], string> = {
    easy: "text-signal",
    medium: "text-night-amber",
    hard: "text-night-red",
};

interface ProblemPaneProps {
    problem?: PublicProblem;
    /** Plain text for a system-design prompt, or a problem the interviewer only described. */
    fallbackText?: string;
    title?: string;
    number?: number;
    total?: number;
    className?: string;
}

/** The problem statement, constraints and worked examples. Everything a candidate is allowed to see. */
export function ProblemPane({ problem, fallbackText, title, number, total, className }: ProblemPaneProps) {
    return (
        <div className={cn("flex min-h-0 flex-col rounded-xl border border-night-line bg-night-raised", className)}>
            <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-3">
                <p className="label-mono text-night-muted">{number && total && total > 1 ? `Problem ${number} of ${total}` : "Problem"}</p>
                {problem && <span className={cn("label-mono", DIFFICULTY_STYLE[problem.difficulty])}>{problem.difficulty}</span>}
            </div>

            <div role="region" aria-label="Problem statement" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline-offset-[-2px]">
                {problem ? (
                    <>
                        <h2 className="font-serif text-2xl leading-tight tracking-tight">{problem.title}</h2>
                        <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-night-foreground/90">{problem.statement}</p>

                        <h3 className="label-mono mt-6 text-night-muted">Constraints</h3>
                        <ul className="mt-2 grid gap-1 text-[13.5px] text-night-foreground/80">
                            {problem.constraints.map((constraint) => (
                                <li key={constraint} className="flex gap-2">
                                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-night-muted" />
                                    <span className="font-mono text-[12.5px] leading-relaxed">{constraint}</span>
                                </li>
                            ))}
                        </ul>

                        <h3 className="label-mono mt-6 text-night-muted">Examples</h3>
                        <div className="mt-2 grid gap-3">
                            {problem.examples.map((example, index) => (
                                <div key={index} className="rounded-lg border border-night-line bg-night-sunken p-3 font-mono text-[12.5px] leading-relaxed">
                                    <p className="mb-1 text-night-muted">Example {index + 1}</p>
                                    <pre className="whitespace-pre-wrap">{formatInputs(problem.signature.params, example.input)}</pre>
                                    <p className="mt-1.5">
                                        <span className="text-night-muted">output </span>
                                        {formatValue(example.output)}
                                    </p>
                                    {example.explanation && <p className="mt-1.5 font-sans text-[12.5px] text-night-muted">{example.explanation}</p>}
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {title && <h2 className="font-serif text-2xl leading-tight tracking-tight">{title}</h2>}
                        <p className={cn("text-[15px] leading-relaxed whitespace-pre-wrap text-night-foreground/90", title && "mt-3")}>
                            {fallbackText || "The interviewer will share a problem here."}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

