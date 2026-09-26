import { ScrollText } from "lucide-react";

import { LogoMark } from "@/components/brand/Logo";
import { formatClock } from "@/hooks/useElapsed";
import type { SessionStatus } from "@/hooks/useInterviewSession";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SessionStatus, string> = {
    connecting: "Connecting",
    live: "Live",
    reconnecting: "Reconnecting",
    failed: "Disconnected",
    ended: "Ended",
};

export interface RoundInfo {
    index: number;
    total: number;
    title: string;
}

interface TopBarProps {
    role?: string;
    status: SessionStatus;
    elapsedSeconds: number;
    plannedMinutes?: number;
    round: RoundInfo | null;
    /** Opens the running transcript. */
    onOpenTranscript?: () => void;
}

/** Where the interview is: the role, the current part of the loop, and the clock against the planned length. */
function TranscriptButton({ onClick, className }: { onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-night-muted transition-colors hover:bg-night-raised hover:text-night-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal", className)}
        >
            <ScrollText className="size-3.5" aria-hidden />
            Transcript
        </button>
    );
}

export function TopBar({ role, status, elapsedSeconds, plannedMinutes, round, onOpenTranscript }: TopBarProps) {
    const over = plannedMinutes ? elapsedSeconds > plannedMinutes * 60 : false;

    return (
        <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-night-line px-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 items-center gap-2.5">
                <LogoMark className="size-6" />
                <span className="truncate text-[13px] font-medium">{role || "Interview"}</span>
            </div>

            <div className="flex items-center gap-4">
                <div className="label-mono flex items-center gap-2 text-night-muted">
                    <span className={cn("size-1.5 rounded-full", status === "live" ? "bg-signal" : status === "failed" ? "bg-night-red" : "bg-night-amber", (status === "live" || status === "connecting" || status === "reconnecting") && "animate-live")} />
                    {STATUS_LABEL[status]}
                    {status === "live" && (
                        <span className={cn("tabular-nums", over ? "text-night-amber" : "text-night-foreground")}>
                            {formatClock(elapsedSeconds)}
                            {plannedMinutes ? <span className="text-night-muted"> / {plannedMinutes}:00</span> : null}
                        </span>
                    )}
                </div>
                {onOpenTranscript && <TranscriptButton onClick={onOpenTranscript} className="md:hidden" />}
            </div>

            <div className="hidden min-w-0 items-center justify-end gap-3 md:flex">
                {round && (
                    <div className="flex min-w-0 items-center gap-3">
                        <ol aria-label={`Part ${round.index + 1} of ${round.total}`} className="flex items-center gap-1">
                            {Array.from({ length: round.total }, (_, i) => (
                                <li key={i} aria-hidden className={cn("h-1 w-4 rounded-full transition-colors duration-500", i < round.index ? "bg-night-foreground/60" : i === round.index ? "bg-signal" : "bg-night-line")} />
                            ))}
                        </ol>
                        <span className="truncate text-xs text-night-muted">
                            {round.index + 1}/{round.total} · <span className="text-night-foreground">{round.title}</span>
                        </span>
                    </div>
                )}
                {onOpenTranscript && <TranscriptButton onClick={onOpenTranscript} />}
            </div>
        </header>
    );
}
