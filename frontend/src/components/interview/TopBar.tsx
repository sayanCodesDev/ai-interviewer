import { LogoMark } from "@/components/brand/Logo";
import { Kbd } from "@/components/ui/kbd";
import { formatClock } from "@/hooks/useElapsed";
import type { SessionStatus } from "@/hooks/useInterviewSession";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SessionStatus, string> = {
    connecting: "Connecting",
    live: "Live",
    reconnecting: "Reconnecting",
    failed: "Disconnected",
};

interface TopBarProps {
    role?: string;
    status: SessionStatus;
    elapsedSeconds: number;
}

export function TopBar({ role, status, elapsedSeconds }: TopBarProps) {
    return (
        <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-night-line px-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 items-center gap-2.5">
                <LogoMark className="size-6" />
                <span className="truncate text-[13px] font-medium">{role || "Interview"}</span>
            </div>

            <div className="label-mono flex items-center gap-2 text-night-muted">
                <span className={cn("size-1.5 rounded-full", status === "live" ? "bg-signal" : status === "failed" ? "bg-night-red" : "bg-night-amber", status !== "failed" && "animate-live")} />
                {STATUS_LABEL[status]}
                {status === "live" && <span className="tabular-nums text-night-foreground">{formatClock(elapsedSeconds)}</span>}
            </div>

            <div className="hidden items-center justify-end gap-4 text-xs text-night-muted md:flex">
                <span className="flex items-center gap-1.5">
                    <Kbd>M</Kbd> Mute
                </span>
                <span className="flex items-center gap-1.5">
                    <Kbd>E</Kbd> Editor
                </span>
            </div>
        </header>
    );
}
