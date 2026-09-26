import { useEffect, useState } from "react";

/** Seconds elapsed since `startedAt` (a `Date.now()` value). Ticks once a second; stays 0 until started. */
export function useElapsed(startedAt: number | null) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (startedAt === null) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [startedAt]);

    return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function formatClock(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
