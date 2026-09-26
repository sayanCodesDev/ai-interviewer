import { cn } from "@/lib/utils";

interface ProblemPanelProps {
    question: string;
    number?: number;
    className?: string;
    /** Render only the statement, without the header, for use inside another container. */
    bare?: boolean;
}

export function ProblemPanel({ question, number, className, bare = false }: ProblemPanelProps) {
    const statement = question ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-night-foreground/90">{question}</p>
    ) : (
        <p className="text-sm leading-relaxed text-night-muted">The interviewer will share a problem here. You can also start writing in the editor.</p>
    );

    if (bare) {
        return <div className={cn("overflow-y-auto", className)}>{statement}</div>;
    }

    return (
        <div className={cn("flex min-h-0 flex-col rounded-xl border border-night-line bg-night-raised", className)}>
            <div className="border-b border-night-line px-4 py-3">
                <p className="label-mono text-night-muted">{number ? `Problem ${number}` : "Problem"}</p>
            </div>
            <div
                role="region"
                aria-label="Problem statement"
                tabIndex={0}
                className="min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline-offset-[-2px]"
            >
                {statement}
            </div>
        </div>
    );
}
