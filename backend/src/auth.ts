import "dotenv/config";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

function resolveJwtSecret(): string {
    const fromEnv = process.env.JWT_SECRET;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv;

    if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET must be set when NODE_ENV=production");
    }

    console.warn(
        "[Auth] JWT_SECRET is not set. Falling back to a random per-process secret — " +
        "existing sessions are invalidated on every restart. Set JWT_SECRET in backend/.env."
    );
    return crypto.randomBytes(32).toString("hex");
}

export const JWT_SECRET = resolveJwtSecret();

export interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
}

// Extends Request interface to include the authenticated user
export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}

export function signAuthToken(user: AuthUser): string {
    return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const token = req.cookies?.token || bearerToken;

    if (!token) {
        res.status(401).json({ msg: "No token, authorization denied" });
        return;
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
        next();
    } catch (err) {
        res.status(401).json({ msg: "Token is not valid" });
    }
};
