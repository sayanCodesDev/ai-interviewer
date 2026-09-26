import { activeInterviews } from "../observability/metrics";
import type { LiveInterview } from "./live";

/** Interviews with a live call on this instance. The conversation state lives here; everything durable is in Postgres. */
const live = new Map<string, LiveInterview>();
let draining = false;

export function getLive(id: string): LiveInterview | undefined {
    return live.get(id);
}

export function addLive(id: string, interview: LiveInterview): void {
    live.set(id, interview);
    activeInterviews.set(live.size);
}

export function removeLive(id: string): void {
    live.delete(id);
    activeInterviews.set(live.size);
}

export function liveCount(): number {
    return live.size;
}

export function isDraining(): boolean {
    return draining;
}

/**
 * Graceful shutdown: refuse new calls, give running interviews time to finish, then close what is
 * left in an orderly way so their transcripts are saved and reports still get generated.
 */
export async function drainLive(graceMs: number): Promise<void> {
    draining = true;
    const deadline = Date.now() + graceMs;
    while (live.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
    await Promise.all([...live.values()].map((interview) => interview.finalize("disconnected")));
}

/** Tests reset the drain flag between cases. */
export function resetDrainingForTesting(): void {
    draining = false;
}
