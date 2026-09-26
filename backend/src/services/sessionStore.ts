import type { InterviewSession } from "./llm";

// An interview is abandoned if the candidate goes this long without a turn.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes

const sessions = new Map<string, InterviewSession>();

export function putSession(session: InterviewSession): void {
    sessions.set(session.userId, session);
}

export function getSession(userId: string): InterviewSession | undefined {
    const session = sessions.get(userId);
    if (!session) return undefined;

    if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
        sessions.delete(userId);
        return undefined;
    }
    return session;
}

export function dropSession(userId: string): void {
    sessions.delete(userId);
}

// Reclaim transcripts for candidates who closed the tab without ending the call.
const sweep = setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [userId, session] of sessions) {
        if (session.lastActiveAt < cutoff) {
            sessions.delete(userId);
            console.log(`[Sessions] Expired idle interview session for user ${userId}`);
        }
    }
}, SWEEP_INTERVAL_MS);

// Never hold the event loop open just for the sweeper.
sweep.unref();
