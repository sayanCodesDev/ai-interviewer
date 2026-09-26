import { Router } from "express";
import { z } from "zod";
import { config } from "../../config/env";
import { logger } from "../../observability/logger";
import { getOwnedInterview, finishInterview, readPlan } from "../../interview/service";
import { LiveInterview } from "../../webrtc/live";
import { addLive, getLive, isDraining, liveCount } from "../../webrtc/registry";
import { pokeReportWorker } from "../../scoring/worker";
import { HttpError, parseInput } from "../errors";
import { currentUser, requireAuth } from "../middleware";
import type { RateLimits } from "../rateLimits";

const offerSchema = z.object({
    sdp: z.string().min(20).max(50_000),
    type: z.literal("offer"),
    interviewId: z.uuid("That isn't a valid interview id."),
});

const idSchema = z.uuid("That isn't a valid interview id.");

export function webrtcRouter(limits: RateLimits): Router {
    const router = Router();

    /**
     * Starts (or resumes) the live call for an interview. The browser's SDP offer goes in, the answer
     * comes back, and from then on the conversation runs over WebRTC.
     */
    router.post("/webrtc/offer", requireAuth, limits.webrtc, async (req, res) => {
        if (isDraining()) {
            res.setHeader("Retry-After", "20");
            throw new HttpError(503, "This server is restarting. Try again in a moment.", "draining");
        }
        const { sdp, type, interviewId } = parseInput(offerSchema, req.body);
        const user = currentUser(req);
        const row = await getOwnedInterview(user.id, interviewId);

        if (row.planStatus !== "READY") throw new HttpError(409, "Your interview is still being prepared.", "not_ready");
        if (row.status === "COMPLETED" || row.status === "ABANDONED") throw new HttpError(409, "This interview has already ended.", "already_ended");

        let live = getLive(interviewId);
        const isNew = !live;

        if (!live) {
            if (row.status === "IN_PROGRESS") {
                // The server restarted (or another instance held the call) and its conversation is gone. Close it honestly.
                const { substantive } = await finishInterview(interviewId, "interrupted");
                if (substantive) pokeReportWorker();
                throw new HttpError(409, "This interview was interrupted and can't be resumed. Your report is being prepared; start a new interview when you're ready.", "interrupted");
            }
            if (liveCount() >= config.maxConcurrentInterviews) {
                res.setHeader("Retry-After", "30");
                throw new HttpError(503, "We're at capacity right now. Please try again in a minute.", "at_capacity");
            }
            const plan = readPlan(row);
            if (!plan) throw new HttpError(409, "Your interview is still being prepared.", "not_ready");

            live = new LiveInterview({
                interview: row,
                plan,
                candidateName: user.name?.split(/\s+/)[0] || undefined,
                onFinished: (_id, info) => {
                    if (info.substantive) pokeReportWorker();
                },
            });
            addLive(interviewId, live);
        }

        try {
            res.json(await live.connect({ sdp, type }));
        } catch (error) {
            logger.error({ err: error, interviewId }, "Could not open the voice connection");
            if (isNew) await live.dispose();
            throw new HttpError(503, "We couldn't start the voice connection. Check your microphone and try again.", "voice_unavailable");
        }
    });

    /** A fallback for ending an interview without a live data channel (a closed tab, a lost connection). */
    router.post("/interviews/:id/end", requireAuth, limits.reads, async (req, res) => {
        const id = parseInput(idSchema, req.params.id);
        const row = await getOwnedInterview(currentUser(req).id, id);

        const live = getLive(id);
        if (live) await live.finalize("candidate_ended");
        else if (row.status === "IN_PROGRESS" || row.status === "CREATED") {
            const { substantive } = await finishInterview(id, "candidate_ended");
            if (substantive) pokeReportWorker();
        }
        res.json({ msg: "Interview ended." });
    });

    return router;
}
