import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { verifyAccessToken, type AuthUser } from "../auth/tokens";
import { HttpError } from "./errors";

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}

/**
 * Protects API routes. Only the Authorization header counts: the refresh cookie is scoped to
 * /api/auth, so a cross-site page can never ride the browser's cookies into these routes.
 */
export const requireAuth: RequestHandler = (req: AuthenticatedRequest, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return next(new HttpError(401, "Sign in to continue.", "unauthenticated"));

    const user = verifyAccessToken(token);
    if (!user) return next(new HttpError(401, "Your session has expired. Sign in again.", "token_invalid"));

    req.user = user;
    next();
};

/** The authenticated user, for handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
    const user = (req as AuthenticatedRequest).user;
    if (!user) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
    return user;
}

/**
 * Rejects state-changing requests that a browser marks as coming from another origin. Cookie-backed
 * endpoints (refresh, logout) rely on this together with SameSite. Non-browser clients send no
 * Origin and are unaffected, which is fine because the rest of the API needs a bearer token anyway.
 */
export function originGuard(allowedOrigins: string[]): RequestHandler {
    const allowed = new Set(allowedOrigins);
    return (req, _res, next) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
        const origin = req.headers.origin;
        if (origin && !allowed.has(origin)) {
            return next(new HttpError(403, "This request came from an origin that isn't allowed.", "origin_forbidden"));
        }
        next();
    };
}

/** Attaches a correlation id, echoed to the client so a bug report can be traced to log lines. */
export const requestId: RequestHandler = (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    (req as Request & { id: string }).id = id;
    res.setHeader("X-Request-Id", id);
    next();
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
    next(new HttpError(404, "Not found.", "not_found"));
};

/** Last stop for every error. Only HttpError messages reach the client; everything else is a generic 500. */
/** Prisma codes for "can't reach the database" (P1xxx) and "table/column does not exist" (P2021, P2022). */
const DATABASE_UNAVAILABLE = /^P(1\d{3}|2021|2022)$/;

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    if (res.headersSent) return;

    if (err instanceof HttpError) {
        res.status(err.status).json({ msg: err.message, code: err.code, ...(err.details ? { fields: err.details } : {}) });
        return;
    }

    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
    // Body-parser and multer errors carry their own 4xx statuses and safe messages.
    if (status >= 400 && status < 500) {
        const type = (err as { type?: string }).type;
        const message =
            type === "entity.too.large" ? "That request is too large." :
            type === "entity.parse.failed" ? "The request body isn't valid JSON." :
            "The request couldn't be processed.";
        res.status(status).json({ msg: message, code: type ?? "bad_request" });
        return;
    }

    const requestId = (req as Request & { id?: string }).id;

    // The database is unreachable, or is missing a table or column (migrations not applied). That is our problem to fix
    // and the caller can only wait, so it is a 503, and nothing about the database reaches the response.
    const dbCode = (err as { code?: unknown })?.code;
    if (typeof dbCode === "string" && DATABASE_UNAVAILABLE.test(dbCode)) {
        logger.error({ err, requestId, path: req.path }, "Database problem while handling a request. If this is 'table does not exist', run: npm run db:migrate:deploy");
        res.setHeader("Retry-After", "30");
        res.status(503).json({ msg: "We're having trouble reaching our systems. Please try again in a minute.", code: "service_unavailable", ref: requestId });
        return;
    }

    // Details stay in the server log; a raw error message (a query, a file path) never goes to the browser, even in development.
    logger.error({ err, requestId, path: req.path }, "Unhandled request error");
    res.status(500).json({ msg: "Something went wrong on our side. Please try again.", code: "internal_error", ref: requestId });
}
