import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { ScoreTrend } from "@/components/dashboard/ScoreTrend";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { formatClock } from "@/hooks/useElapsed";
import { AppLayout } from "@/layouts/AppLayout";
import { apiErrorMessage } from "@/lib/api";
import { deleteInterview, listInterviews } from "@/lib/interviews";
import type { InterviewListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function destinationFor(item: InterviewListItem): string {
    if (item.status === "COMPLETED" || item.status === "ABANDONED") return `/report/${item.id}`;
    if (item.status === "IN_PROGRESS") return `/report/${item.id}`;
    return `/lobby/${item.id}`;
}

function statusText(item: InterviewListItem): string {
    if (item.status === "CREATED") return "Not started";
    if (item.status === "IN_PROGRESS") return "In progress";
    if (item.status === "ABANDONED") return "Too short to assess";
    if (item.reportStatus === "PENDING" || item.reportStatus === "GENERATING") return "Analysing…";
    if (item.reportStatus === "FAILED") return "Report failed";
    return "Completed";
}

export function Dashboard() {
    usePageTitle("Your interviews");
    const { user } = useAuth();
    const [items, setItems] = useState<InterviewListItem[] | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<InterviewListItem | null>(null);

    const load = useCallback(async (from?: string) => {
        try {
            const page = await listInterviews(from);
            setItems((current) => (from && current ? [...current, ...page.items] : page.items));
            setCursor(page.nextCursor);
            setError(null);
        } catch (err) {
            setError(apiErrorMessage(err, "We couldn't load your interviews."));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Reports for recent interviews may still be generating; refresh while any are.
    useEffect(() => {
        if (!items?.some((i) => i.reportStatus === "PENDING" || i.reportStatus === "GENERATING")) return;
        const timer = setTimeout(() => void load(), 5000);
        return () => clearTimeout(timer);
    }, [items, load]);

    async function confirmDelete() {
        if (!pendingDelete) return;
        try {
            await deleteInterview(pendingDelete.id);
            setItems((current) => current?.filter((i) => i.id !== pendingDelete.id) ?? null);
            toast.success("Interview deleted.");
        } catch (err) {
            toast.error(apiErrorMessage(err, "We couldn't delete that interview."));
        } finally {
            setPendingDelete(null);
        }
    }

    const firstName = user?.name?.split(/\s+/)[0];

    return (
        <AppLayout>
            <div className="app-container py-12 lg:py-16">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <div>
                        <p className="label-mono text-muted-foreground">Your interviews</p>
                        <h1 className="text-h2 mt-4">{firstName ? `Welcome back, ${firstName}.` : "Welcome back."}</h1>
                    </div>
                    <Button variant="signal" size="lg" asChild>
                        <Link to="/setup">
                            <Plus /> New interview
                        </Link>
                    </Button>
                </div>

                {error && <p role="alert" className="mt-10 text-sm text-destructive">{error}</p>}

                {items === null && !error && (
                    <div className="mt-12 grid gap-3" aria-busy="true">
                        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                )}

                {items && items.length === 0 && (
                    <div className="mt-12 rounded-xl border bg-card p-10 text-center">
                        <h2 className="text-h3">Nothing here yet.</h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                            Take your first interview: paste a job description, talk it through, solve a problem or two, and get a scored report with a plan.
                        </p>
                        <Button variant="signal" size="lg" className="mt-7" asChild>
                            <Link to="/setup">Start your first interview <ArrowRight /></Link>
                        </Button>
                    </div>
                )}

                {items && items.length > 0 && (
                    <div className="mt-12 grid gap-8">
                        <ScoreTrend items={items} />

                        <ul className="grid gap-3">
                            {items.map((item) => (
                                <li key={item.id} className="group relative flex items-center gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/40">
                                    <Link
                                        to={destinationFor(item)}
                                        className="flex min-w-0 flex-1 items-center gap-5 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-4 focus-visible:after:ring-foreground/10"
                                    >
                                        <div className="w-16 shrink-0 text-center">
                                            {item.score !== null ? (
                                                <>
                                                    <p className="font-serif text-3xl leading-none tabular-nums">{item.score}</p>
                                                    <p className="label-mono mt-1.5 text-muted-foreground">/ 100</p>
                                                </>
                                            ) : item.reportStatus === "PENDING" || item.reportStatus === "GENERATING" ? (
                                                <Spinner className="mx-auto" />
                                            ) : (
                                                <p className="font-mono text-lg text-muted-foreground">–</p>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-medium">{item.role}</p>
                                            <p className="mt-1 text-[13px] text-muted-foreground capitalize">
                                                {item.level} · {item.format} · {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                                                {item.durationSeconds ? ` · ${formatClock(item.durationSeconds)}` : ""}
                                            </p>
                                        </div>
                                        <div className="ml-auto hidden text-right sm:block">
                                            <p className={cn("text-sm", item.band === "Interview-ready" || item.band === "Close" ? "font-medium" : "text-muted-foreground")}>{item.band ?? statusText(item)}</p>
                                            {item.band && <p className="mt-1 text-[13px] text-muted-foreground">{statusText(item)}</p>}
                                        </div>
                                    </Link>
                                    <Button variant="ghost" size="icon-sm" aria-label={`Delete interview: ${item.role}`} className="relative z-10 text-muted-foreground" onClick={() => setPendingDelete(item)}>
                                        <Trash2 />
                                    </Button>
                                </li>
                            ))}
                        </ul>

                        {cursor && (
                            <Button variant="outline" className="mx-auto" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(cursor); setLoadingMore(false); }}>
                                {loadingMore && <Spinner />} Show older interviews
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this interview?</DialogTitle>
                        <DialogDescription>The transcript, your code and the report are removed permanently. This can't be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingDelete(null)}>Keep it</Button>
                        <Button variant="destructive" onClick={() => void confirmDelete()}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
