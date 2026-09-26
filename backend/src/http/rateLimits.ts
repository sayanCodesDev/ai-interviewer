import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { AuthenticatedRequest } from "./middleware";

const MINUTE = 60_000;

export interface RateLimitSettings {
    /** Multiplies every limit. Tests use a large value so they exercise handlers, not the limiter. */
    scale?: number;
}

function limiter(
    windowMs: number,
    limit: number,
    scale: number,
    message: string,
    options: { key?: (req: Request) => string; skipSuccessfulRequests?: boolean } = {},
): RequestHandler {
    return rateLimit({
        windowMs,
        limit: Math.max(1, Math.round(limit * scale)),
        standardHeaders: "draft-7",
        legacyHeaders: false,
        skipSuccessfulRequests: options.skipSuccessfulRequests,
        keyGenerator: (req) => (options.key ? options.key(req) : ipKeyGenerator(req.ip ?? "unknown")),
        handler: (_req, res) => {
            res.status(429).json({ msg: message, code: "rate_limited" });
        },
    });
}

const byIp = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");
const byUser = (req: Request) => (req as AuthenticatedRequest).user?.id ?? byIp(req);

function normalisedEmail(req: Request): string {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
    return `${byIp(req)}|${email}`;
}

/**
 * Every limit that protects a paid dependency (LLM, STT/TTS), a CPU-heavy path (password
 * hashing, code execution) or an attackable form. Counters live in process memory, so with N
 * instances the effective limit is up to N times higher; back the store with Redis to make it exact.
 */
export function createRateLimits({ scale = 1 }: RateLimitSettings = {}) {
    return {
        /** Blanket ceiling for the whole API. */
        global: limiter(MINUTE, 300, scale, "Too many requests. Please slow down."),
        signup: limiter(60 * MINUTE, 8, scale, "Too many sign-ups from this network. Try again later."),
        /** Failed sign-ins per address + email; a correct password does not count against you. */
        signinFailures: limiter(15 * MINUTE, 8, scale, "Too many failed sign-in attempts. Try again in a few minutes.", {
            key: normalisedEmail,
            skipSuccessfulRequests: true,
        }),
        signinAny: limiter(15 * MINUTE, 40, scale, "Too many sign-in attempts. Try again in a few minutes."),
        refresh: limiter(15 * MINUTE, 120, scale, "Too many session refreshes. Try again shortly."),
        createInterview: limiter(60 * MINUTE, 12, scale, "You're creating interviews too quickly. Try again later.", { key: byUser }),
        runCode: limiter(MINUTE, 30, scale, "You're running code too quickly. Wait a moment.", { key: byUser }),
        reads: limiter(MINUTE, 120, scale, "Too many requests. Please slow down.", { key: byUser }),
        account: limiter(60 * MINUTE, 6, scale, "Too many attempts. Try again later.", { key: byUser }),
        webrtc: limiter(15 * MINUTE, 20, scale, "Too many call attempts. Try again shortly.", { key: byUser }),
        voiceSample: limiter(15 * MINUTE, 10, scale, "You've played the sample a lot. Try again in a few minutes.", { key: byUser }),
    };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
