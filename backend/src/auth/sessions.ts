import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { generateRefreshToken, hashRefreshToken, type AuthUser } from "./tokens";

/** A refresh token is valid this long after it was issued. Each use issues a fresh one. */
export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Absolute cap on one sign-in, however often it is refreshed. */
const FAMILY_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/**
 * Two tabs refreshing at the same instant both present the same token. The loser is not
 * a thief, so a token rotated this recently is answered with a sibling instead of a revocation.
 */
const REUSE_GRACE_MS = 10_000;

export interface SessionMeta {
    userAgent?: string;
    ip?: string;
}

export interface IssuedSession {
    token: string;
    expiresAt: Date;
}

export type RotateResult =
    | ({ ok: true; user: AuthUser } & IssuedSession)
    | { ok: false; reason: "invalid" | "expired" | "reused" };

function clip(value: string | undefined, max: number): string | undefined {
    return value ? value.slice(0, max) : undefined;
}

async function insertToken(userId: string, familyId: string, familyStartedAt: Date, meta: SessionMeta): Promise<IssuedSession> {
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await prisma.refreshSession.create({
        data: {
            userId,
            familyId,
            familyStartedAt,
            tokenHash: hashRefreshToken(token),
            expiresAt,
            userAgent: clip(meta.userAgent, 200),
            ip: clip(meta.ip, 64),
        },
    });
    return { token, expiresAt };
}

/** Called at sign-in / sign-up: starts a new family. */
export function startSession(userId: string, meta: SessionMeta = {}): Promise<IssuedSession> {
    return insertToken(userId, crypto.randomUUID(), new Date(), meta);
}

async function revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/**
 * Exchanges a refresh token for a new one. Presenting a token that was already rotated
 * (outside the grace window) means it leaked, so every token in that family is revoked.
 */
export async function rotateSession(rawToken: string, meta: SessionMeta = {}): Promise<RotateResult> {
    const row = await prisma.refreshSession.findUnique({ where: { tokenHash: hashRefreshToken(rawToken) } });
    if (!row) return { ok: false, reason: "invalid" };

    // Signed out, or its family was already burned: never reusable, and not worth a second burn.
    if (row.revokedAt) return { ok: false, reason: "invalid" };

    const now = Date.now();
    if (row.rotatedAt) {
        if (now - row.rotatedAt.getTime() > REUSE_GRACE_MS) {
            await revokeFamily(row.familyId);
            return { ok: false, reason: "reused" };
        }
        // Rotated a moment ago: a concurrent refresh from the same browser, answered with a sibling.
    } else {
        if (row.expiresAt.getTime() <= now || now - row.familyStartedAt.getTime() > FAMILY_MAX_AGE_MS) {
            await revokeFamily(row.familyId);
            return { ok: false, reason: "expired" };
        }
        // Claim the token. If another request got there first this matches nothing, which is
        // the same benign concurrent case as above.
        await prisma.refreshSession.updateMany({ where: { id: row.id, rotatedAt: null }, data: { rotatedAt: new Date() } });
    }

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) return { ok: false, reason: "invalid" };

    const issued = await insertToken(row.userId, row.familyId, row.familyStartedAt, meta);
    return { ok: true, user: { id: user.id, email: user.email, name: user.name }, ...issued };
}

/** Sign out this device: revokes the token's whole family. Unknown tokens are ignored. */
export async function revokeSessionByToken(rawToken: string): Promise<void> {
    const row = await prisma.refreshSession.findUnique({ where: { tokenHash: hashRefreshToken(rawToken) } });
    if (row) await revokeFamily(row.familyId);
}

/** Sign out everywhere. */
export async function revokeAllSessions(userId: string): Promise<void> {
    await prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Housekeeping: rows past their expiry can never be used again. */
export async function purgeExpiredSessions(): Promise<number> {
    const { count } = await prisma.refreshSession.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    return count;
}
