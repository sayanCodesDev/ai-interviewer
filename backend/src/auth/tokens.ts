import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env";

const ISSUER = "ai-interviewer";
const AUDIENCE = "ai-interviewer-api";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
}

/** Access tokens are short-lived and stateless; revocation happens at the refresh token. */
export function signAccessToken(user: AuthUser): string {
    return jwt.sign({ email: user.email, name: user.name ?? null }, config.jwtSecret, {
        algorithm: "HS256",
        subject: user.id,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
}

/** Returns the user a valid access token belongs to, or null. Pins the algorithm to defeat alg-confusion. */
export function verifyAccessToken(token: string): AuthUser | null {
    try {
        const payload = jwt.verify(token, config.jwtSecret, {
            algorithms: ["HS256"],
            issuer: ISSUER,
            audience: AUDIENCE,
        });
        if (typeof payload === "string" || typeof payload.sub !== "string") return null;
        return { id: payload.sub, email: String(payload.email ?? ""), name: (payload.name as string | null) ?? null };
    } catch {
        return null;
    }
}

/** 256 random bits, URL-safe. Only its hash is stored. */
export function generateRefreshToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}
