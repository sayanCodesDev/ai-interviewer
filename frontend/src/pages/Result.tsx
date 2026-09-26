import { m } from "motion/react";
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/layouts/AppLayout";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { readInterviewSummary } from "@/lib/session";
import { usePageTitle } from "@/hooks/usePageTitle";

function CheckMark() {
    return (
        <m.svg viewBox="0 0 48 48" aria-hidden className="size-16" initial="hidden" animate="visible">
            <m.circle
                cx="24"
                cy="24"
                r="24"
                fill="var(--signal)"
                variants={{ hidden: { scale: 0.6, opacity: 0 }, visible: { scale: 1, opacity: 1 } }}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                style={{ transformOrigin: "24px 24px" }}
            />
            <m.path
                d="M14.5 25l6.5 6.5L33.5 17"
                fill="none"
                stroke="#151512"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
                transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
            />
        </m.svg>
    );
}

function formatDuration(seconds: number) {
    if (seconds < 60) return "Under a minute";
    return `${Math.round(seconds / 60)} min`;
}

export function Result() {
    usePageTitle("Interview complete");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");
    const { user } = useAuth();
    const summary = useMemo(readInterviewSummary, []);
    const firstName = user?.name?.split(/\s+/)[0];

    const facts = [
        summary?.role ? { label: "Role", value: summary.role } : null,
        summary?.durationSeconds !== undefined ? { label: "Duration", value: formatDuration(summary.durationSeconds) } : null,
        summary?.problemsSubmitted !== undefined ? { label: "Problems submitted", value: String(summary.problemsSubmitted) } : null,
    ].filter((fact): fact is { label: string; value: string } => fact !== null);

    return (
        <AppLayout>
            <div className="app-container flex flex-col items-center py-16 text-center sm:py-24">
                <CheckMark />

                <m.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: EASE_OUT_EXPO, delay: 0.2 }}
                    className="flex flex-col items-center"
                >
                    <h1 className="text-h2 mt-8">Interview complete.</h1>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                        {firstName ? `Thanks, ${firstName}. ` : "Thanks. "}
                        The interviewer shares its feedback out loud as a full session wraps up.
                    </p>

                    {facts.length > 0 && (
                        <dl className="mt-10 grid w-full max-w-xl divide-y rounded-xl border bg-card text-left sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
                            {facts.map((fact) => (
                                <div key={fact.label} className="px-6 py-5">
                                    <dt className="label-mono text-muted-foreground">{fact.label}</dt>
                                    <dd className="mt-3 font-serif text-2xl leading-tight tracking-tight">{fact.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                        <Button variant="signal" size="lg" onClick={() => navigate(`/form?userId=${userId || ""}`)}>
                            Start another interview
                        </Button>
                        <Button variant="outline" size="lg" asChild>
                            <Link to="/">Back to home</Link>
                        </Button>
                    </div>
                </m.div>
            </div>
        </AppLayout>
    );
}
