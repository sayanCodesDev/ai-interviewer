import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { burnPasswordCheck, hashPassword, needsRehash, passwordSchema, verifyPassword } from "../../auth/password";
import { revokeAllSessions, revokeSessionByToken, rotateSession, startSession, REFRESH_TTL_MS, type IssuedSession } from "../../auth/sessions";
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, type AuthUser } from "../../auth/tokens";
import { config } from "../../config/env";
import { HttpError, parseInput } from "../errors";
import { currentUser, requireAuth } from "../middleware";
import type { RateLimits } from "../rateLimits";

export const REFRESH_COOKIE = "aii_rt";
/** The refresh cookie is only ever sent to these routes, never to the rest of the API. */
const COOKIE_PATH = "/api/auth";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

const signupSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1, "Enter your name.").max(80, "That name is too long.").optional(),
});

const signinSchema = z.object({
    email: emailSchema,
    // Not passwordSchema: sign-in must accept whatever was set before the policy tightened.
    password: z.string().min(1, "Enter your password.").max(1024),
});

function isSecure(req: Request): boolean {
    return config.isProduction || req.secure || req.headers["x-forwarded-proto"] === "https";
}

function setRefreshCookie(req: Request, res: Response, session: IssuedSession): void {
    const secure = isSecure(req) || config.cookieSameSite === "none";
    res.cookie(REFRESH_COOKIE, session.token, {
        httpOnly: true,
        secure,
        sameSite: config.cookieSameSite,
        domain: config.cookieDomain,
        path: COOKIE_PATH,
        maxAge: REFRESH_TTL_MS,
    });
}

function clearRefreshCookie(req: Request, res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: isSecure(req) || config.cookieSameSite === "none",
        sameSite: config.cookieSameSite,
        domain: config.cookieDomain,
        path: COOKIE_PATH,
    });
}

function publicUser(user: AuthUser) {
    return { id: user.id, email: user.email, name: user.name ?? null };
}

function sessionResponse(user: AuthUser) {
    return { user: publicUser(user), accessToken: signAccessToken(user), expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

function meta(req: Request) {
    return { userAgent: req.headers["user-agent"], ip: req.ip };
}

export function authRouter(limits: RateLimits): Router {
    const router = Router();

    router.post("/signup", limits.signup, async (req, res) => {
        const { email, password, name } = parseInput(signupSchema, req.body);

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            // Spend the hashing time anyway so a taken address is not distinguishable by latency.
            await hashPassword(password);
            throw new HttpError(409, "An account with this email already exists. Try signing in.", "email_taken");
        }

        let user;
        try {
            user = await prisma.user.create({ data: { email, password: await hashPassword(password), name } });
        } catch (error) {
            // Two sign-ups for the same address racing past the check above.
            if ((error as { code?: string }).code === "P2002") {
                throw new HttpError(409, "An account with this email already exists. Try signing in.", "email_taken");
            }
            throw error;
        }

        setRefreshCookie(req, res, await startSession(user.id, meta(req)));
        res.status(201).json(sessionResponse(user));
    });

    router.post("/signin", limits.signinAny, limits.signinFailures, async (req, res) => {
        const { email, password } = parseInput(signinSchema, req.body);

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            await burnPasswordCheck(password);
            throw new HttpError(401, "Incorrect email or password.", "invalid_credentials");
        }
        if (!(await verifyPassword(user.password, password))) {
            throw new HttpError(401, "Incorrect email or password.", "invalid_credentials");
        }

        if (needsRehash(user.password)) {
            await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
        }

        setRefreshCookie(req, res, await startSession(user.id, meta(req)));
        res.json(sessionResponse(user));
    });

    /** Trades the httpOnly refresh cookie for a fresh access token (and rotates the cookie). */
    router.post("/refresh", limits.refresh, async (req, res) => {
        const raw = req.cookies?.[REFRESH_COOKIE];
        if (typeof raw !== "string" || raw.length === 0) {
            throw new HttpError(401, "No active session.", "no_session");
        }

        const result = await rotateSession(raw, meta(req));
        if (!result.ok) {
            clearRefreshCookie(req, res);
            throw new HttpError(401, "Your session has expired. Sign in again.", `session_${result.reason}`);
        }

        setRefreshCookie(req, res, result);
        res.json(sessionResponse(result.user));
    });

    router.post("/logout", async (req, res) => {
        const raw = req.cookies?.[REFRESH_COOKIE];
        if (typeof raw === "string" && raw.length > 0) await revokeSessionByToken(raw);
        clearRefreshCookie(req, res);
        res.json({ msg: "Signed out." });
    });

    router.post("/logout-all", requireAuth, async (req, res) => {
        await revokeAllSessions(currentUser(req).id);
        clearRefreshCookie(req, res);
        res.json({ msg: "Signed out everywhere." });
    });

    router.get("/me", requireAuth, (req, res) => {
        res.json({ user: publicUser(currentUser(req)) });
    });

    return router;
}
