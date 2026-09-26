import { ArrowRight, ChevronDown, Copy, Download, ExternalLink, Printer, Trash2 } from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { CodeReview } from "@/components/report/CodeReview";
import { ScoreRing } from "@/components/report/ScoreRing";
import { Transcript } from "@/components/report/Transcript";
import { buildMarkdown, buildTranscriptText, downloadText } from "@/components/report/markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { AppLayout } from "@/layouts/AppLayout";
import { apiErrorMessage } from "@/lib/api";
import { deleteInterview, fetchReport, retryReport } from "@/lib/interviews";
import { EASE_OUT_EXPO } from "@/lib/motion";
import type { Evidence, ProblemReport, ReportResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAND_COPY: Record<string, string> = {
    "Interview-ready": "Ready for the real thing",
    Close: "Close",
    Developing: "Developing",
    "Early stage": "Early stage",
};

const VERDICT: Record<ProblemReport["complexity"]["verdict"], string> = {
    correct: "Correct",
    partially: "Partly right",
    incorrect: "Not right",
    not_discussed: "Not discussed",
};

function SectionHeading({ label, title, children }: { label: string; title: string; children?: React.ReactNode }) {
    return (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
                <p className="label-mono text-muted-foreground">{label}</p>
                <h2 className="text-h3 mt-3">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function Quotes({ items, onJump }: { items: Evidence[]; onJump: (turn: number) => void }) {
    if (items.length === 0) return null;
    return (
        <ul className="mt-3 grid gap-1.5">
            {items.map((e) => (
                <li key={`${e.turn}-${e.quote}`} className="border-l-2 border-signal pl-3 text-[13.5px] leading-snug text-muted-foreground">
                    <span className="italic">“{e.quote}”</span>{" "}
                    <button type="button" onClick={() => onJump(e.turn)} className="whitespace-nowrap text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground print:hidden">
                        see in transcript
                    </button>
                </li>
            ))}
        </ul>
    );
}

function ScoreBar({ score }: { score: number | null }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            {score !== null && (
                <m.div
                    className="h-full rounded-full bg-foreground"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${score * 10}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
                />
            )}
        </div>
    );
}

function ProblemCard({ p }: { p: ProblemReport }) {
    const solved = p.total > 0 && p.passed === p.total;
    return (
        <article className="rounded-xl border bg-card p-6 print:break-inside-avoid">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-serif text-2xl tracking-tight">{p.title}</h3>
                    <p className="label-mono mt-2 text-muted-foreground">{p.difficulty}</p>
                </div>
                <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", solved ? "border-transparent bg-signal text-signal-foreground" : "text-foreground")}>
                    {p.attempts === 0 ? (p.movedOn ? "Skipped" : "Not submitted") : `${p.passed} of ${p.total} tests`}
                </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                {[
                    ["Submissions", String(p.attempts)],
                    ["Test runs", String(p.runs)],
                    ["Hints used", String(p.hintsUsed)],
                    ["Language", p.language || "n/a"],
                ].map(([k, v]) => (
                    <div key={k}>
                        <dt className="label-mono text-muted-foreground">{k}</dt>
                        <dd className="mt-1 font-medium capitalize">{v}</dd>
                    </div>
                ))}
            </dl>

            {p.feedback && <p className="mt-5 text-[15px] leading-relaxed">{p.feedback}</p>}
            {p.codeQuality && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{p.codeQuality}</p>}

            <div className="mt-5 grid gap-3 rounded-lg bg-secondary/60 p-4 text-sm sm:grid-cols-2">
                <p><span className="label-mono block text-muted-foreground">Complexity you gave</span>{p.complexity.stated ?? "Not stated"} <span className="text-muted-foreground">· {VERDICT[p.complexity.verdict]}</span></p>
                <p><span className="label-mono block text-muted-foreground">Intended solution</span>time {p.intendedComplexity.time}, space {p.intendedComplexity.space}</p>
            </div>

            {p.code && (
                <details className="group mt-5 print:open" open={(p.review?.length ?? 0) > 0}>
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium print:hidden">
                        <ChevronDown className="size-4 transition-transform group-open:rotate-180" /> {(p.review?.length ?? 0) > 0 ? "Your code, reviewed line by line" : "Your final code"}
                    </summary>
                    <CodeReview code={p.code} notes={p.review} />
                </details>
            )}
        </article>
    );
}

export function Report() {
    usePageTitle("Interview report");
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<ReportResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [highlight, setHighlight] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [retrying, setRetrying] = useState(false);

    const load = useCallback(async () => {
        try {
            const next = await fetchReport(id);
            setData(next);
            setError(null);
            return next;
        } catch (err) {
            setError(apiErrorMessage(err, "We couldn't load this report."));
            return null;
        }
    }, [id]);

    // The report is generated in the background, so keep asking until it lands.
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            const next = await load();
            if (cancelled || !next) return;
            if (next.status === "PENDING" || next.status === "GENERATING") timer = setTimeout(tick, 3000);
        };
        void tick();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [load]);

    const jumpTo = useCallback((turn: number) => {
        const el = document.getElementById(`t-${turn}`);
        if (!el) return;
        el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
        setHighlight(turn);
        setTimeout(() => setHighlight((current) => (current === turn ? null : current)), 2500);
    }, []);

    const report = data?.report ?? null;
    const generating = data?.status === "PENDING" || data?.status === "GENERATING";
    const markdown = useMemo(() => (data ? buildMarkdown(data) : ""), [data]);

    async function handleRetry() {
        setRetrying(true);
        try {
            await retryReport(id);
            await load();
        } catch (err) {
            toast.error(apiErrorMessage(err, "We couldn't restart the report."));
        } finally {
            setRetrying(false);
        }
    }

    async function handleDelete() {
        try {
            await deleteInterview(id);
            toast.success("Interview deleted.");
            navigate("/dashboard", { replace: true });
        } catch (err) {
            toast.error(apiErrorMessage(err, "We couldn't delete this interview."));
        }
    }

    if (!data) {
        return (
            <AppLayout>
                <div className="app-container py-16">
                    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : (
                        <div className="grid gap-5" aria-busy="true">
                            <Skeleton className="h-6 w-40" />
                            <Skeleton className="h-16 w-full max-w-xl" />
                            <Skeleton className="h-48 w-full" />
                        </div>
                    )}
                </div>
            </AppLayout>
        );
    }

    const { interview } = data;
    const date = interview.endedAt ? new Date(interview.endedAt).toLocaleDateString(undefined, { dateStyle: "long" }) : "";

    return (
        <AppLayout>
            <div className="app-container py-12 lg:py-16">
                {/* ------------------------------------------------------------------ header */}
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div>
                        <p className="label-mono text-muted-foreground">Interview report</p>
                        <h1 className="text-h2 mt-4">{interview.role}</h1>
                        <p className="mt-3 text-sm text-muted-foreground capitalize">
                            {interview.level} level · {interview.format} format{date ? ` · ${date}` : ""}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 print:hidden">
                        <Button variant="outline" size="sm" onClick={() => downloadText(`interview-report-${id.slice(0, 8)}.md`, markdown)}>
                            <Download /> Download
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                            <Printer /> Print
                        </Button>
                        <Button variant="signal" size="sm" asChild>
                            <Link to="/setup">
                                Another interview <ArrowRight />
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* ------------------------------------------------------------ report states */}
                {generating && (
                    <div role="status" aria-live="polite" className="mt-12 rounded-xl border bg-card p-8">
                        <p className="flex items-center gap-3 text-[15px] font-medium">
                            <Spinner /> Analysing your interview
                        </p>
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            We're reading each part of the conversation, checking your code against the tests, and writing your feedback. This usually takes one to three minutes. Your transcript is already below.
                        </p>
                        <div className="mt-6 grid gap-3">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    </div>
                )}

                {data.status === "NONE" && (
                    <div className="mt-12 rounded-xl border bg-card p-8">
                        <h2 className="text-h3">Not enough to assess.</h2>
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            This session was too short for a fair report: it needs a few answers or at least one code submission. Your transcript is below, and you can start again whenever you're ready.
                        </p>
                    </div>
                )}

                {data.status === "FAILED" && (
                    <div role="alert" className="mt-12 rounded-xl border border-destructive/30 bg-destructive/5 p-8">
                        <h2 className="text-h3">We couldn't finish your report.</h2>
                        <p className="mt-3 text-sm text-muted-foreground">{data.error} Your transcript is safe.</p>
                        <Button variant="outline" size="sm" className="mt-5" onClick={() => void handleRetry()} disabled={retrying}>
                            {retrying && <Spinner />} Try again
                        </Button>
                    </div>
                )}

                {report && (
                    <>
                        {/* ----------------------------------------------------------------- overall */}
                        <section className="mt-14 grid items-center gap-10 border-y py-12 md:grid-cols-[auto_1fr]">
                            <ScoreRing score={report.overall.score} band={report.overall.band} />
                            <div>
                                <p className="label-mono text-muted-foreground">{BAND_COPY[report.overall.band] ?? report.overall.band}</p>
                                <p className="mt-3 max-w-2xl font-serif text-3xl leading-tight tracking-tight sm:text-4xl">{report.overall.headline}</p>
                                <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{report.summary}</p>
                                <dl className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
                                    {[
                                        ["Time", `${Math.round(report.metrics.durationMinutes)} min`],
                                        ["You said", `${report.metrics.candidateWords.toLocaleString()} words`],
                                        ["Problems solved", `${report.metrics.problemsSolved} of ${report.metrics.problemsAttempted}`],
                                        ["Hints", String(report.metrics.hintsUsed)],
                                    ].map(([k, v]) => (
                                        <div key={k}>
                                            <dt className="label-mono text-muted-foreground">{k}</dt>
                                            <dd className="mt-1.5 font-serif text-2xl tracking-tight">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                                {report.metrics.segmentsAnalysed < report.metrics.segmentsTotal && (
                                    <p className="mt-5 text-[13px] text-muted-foreground">
                                        Note: {report.metrics.segmentsTotal - report.metrics.segmentsAnalysed} part of the interview couldn't be analysed, so this score is based on the rest.
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* -------------------------------------------------------------- dimensions */}
                        <section className="py-16">
                            <SectionHeading label="Scores" title="How you did, skill by skill" />
                            <div className="grid gap-x-16 gap-y-9 md:grid-cols-2">
                                {report.dimensions.map((d) => (
                                    <div key={d.key} className="print:break-inside-avoid">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <h3 className="text-[15px] font-medium">
                                                {d.label}
                                                {d.objective && <span className="label-mono ml-2 text-muted-foreground">from tests</span>}
                                            </h3>
                                            <span className="font-mono text-sm tabular-nums">{d.score === null ? "n/a" : `${d.score}/10`}</span>
                                        </div>
                                        <div className="mt-3"><ScoreBar score={d.score} /></div>
                                        {d.summary && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d.summary}</p>}
                                        <Quotes items={d.evidence.slice(0, 2)} onJump={jumpTo} />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* ------------------------------------------------------------------ rounds */}
                        <section className="border-t py-16">
                            <SectionHeading label="Part by part" title="Every stage of the loop" />
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {report.rounds.filter((r) => r.type !== "wrapup" && (r.summary || r.score !== null)).map((r) => (
                                    <article key={r.key} className="rounded-xl border bg-card p-6 print:break-inside-avoid">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <h3 className="text-[15px] font-medium">{r.title}</h3>
                                            {r.score !== null && <span className="font-mono text-sm tabular-nums">{r.score}/10</span>}
                                        </div>
                                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.summary}</p>
                                        {r.highlights.length > 0 && (
                                            <ul className="mt-3 grid gap-1.5 text-sm">
                                                {r.highlights.map((h) => (
                                                    <li key={h} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-foreground" />{h}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </section>

                        {/* ---------------------------------------------------------------- problems */}
                        {report.problems.length > 0 && (
                            <section className="border-t py-16">
                                <SectionHeading label="Coding" title="Your solutions" />
                                <div className="grid gap-5">
                                    {report.problems.map((p) => <ProblemCard key={p.problemKey} p={p} />)}
                                </div>
                            </section>
                        )}

                        {/* ------------------------------------------------------ strengths + weaknesses */}
                        <section className="grid gap-16 border-t py-16 lg:grid-cols-2">
                            <div>
                                <SectionHeading label="Where your effort showed" title="What's working" />
                                <ul className="grid gap-7">
                                    {report.strengths.map((s) => (
                                        <li key={s.title} className="print:break-inside-avoid">
                                            <h3 className="text-[15px] font-medium">{s.title}</h3>
                                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
                                            <Quotes items={s.evidence} onJump={jumpTo} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <SectionHeading label="What to change" title="Where to focus next" />
                                <ul className="grid gap-7">
                                    {report.improvements.map((s) => (
                                        <li key={s.title} className="print:break-inside-avoid">
                                            <h3 className="flex items-center gap-2 text-[15px] font-medium">
                                                {s.title}
                                                {s.priority === 1 && <span className="label-mono rounded-full bg-signal px-2 py-0.5 text-signal-foreground">Top priority</span>}
                                            </h3>
                                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
                                            <Quotes items={s.evidence} onJump={jumpTo} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>

                        {/* -------------------------------------------------------------- study plan */}
                        <section className="border-t py-16">
                            <SectionHeading label="Your preparation plan" title="What to practise, in order" />
                            <ol className="grid gap-5">
                                {report.studyPlan.map((s, i) => (
                                    <li key={s.topic} className="grid gap-4 rounded-xl border bg-card p-6 sm:grid-cols-[3rem_1fr] print:break-inside-avoid">
                                        <span className="font-serif text-3xl text-muted-foreground">{i + 1}</span>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <h3 className="text-lg font-medium">{s.topic}</h3>
                                                <span className={cn("label-mono rounded-full border px-2 py-0.5", s.priority === "high" && "border-transparent bg-foreground text-background")}>{s.priority} priority</span>
                                            </div>
                                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.why}</p>
                                            <ul className="mt-4 grid gap-2">
                                                {s.actions.map((a) => (
                                                    <li key={a} className="flex items-start gap-3 text-sm">
                                                        <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded border" />
                                                        {a}
                                                    </li>
                                                ))}
                                            </ul>
                                            {s.resources.length > 0 && (
                                                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                                    {s.resources.map((r) => (
                                                        <li key={r.url}>
                                                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline decoration-border underline-offset-4 hover:decoration-foreground">
                                                                {r.title} <ExternalLink className="size-3.5" />
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    </>
                )}

                {/* --------------------------------------------------------------------- transcript */}
                <section className="border-t py-16" id="transcript">
                    <SectionHeading label="Transcript" title="The full conversation">
                        <Button
                            variant="outline"
                            size="sm"
                            className="print:hidden"
                            onClick={async () => {
                                await navigator.clipboard.writeText(buildTranscriptText(data)).catch(() => undefined);
                                toast.success("Transcript copied.");
                            }}
                        >
                            <Copy /> Copy
                        </Button>
                    </SectionHeading>
                    <Transcript entries={data.transcript} rounds={interview.rounds} highlight={highlight} />
                </section>

                {/* ----------------------------------------------------------------------- footer */}
                <footer className="border-t pt-8 text-[13px] leading-relaxed text-muted-foreground">
                    {report && <p className="max-w-2xl">{report.disclaimer}</p>}
                    <Button variant="ghost" size="sm" className="mt-6 text-muted-foreground print:hidden" onClick={() => setConfirmDelete(true)}>
                        <Trash2 /> Delete this interview
                    </Button>
                </footer>
            </div>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this interview?</DialogTitle>
                        <DialogDescription>The transcript, your code and the report are removed permanently. This can't be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                        <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
