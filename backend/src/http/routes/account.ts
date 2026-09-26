import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { verifyPassword } from "../../auth/password";
import { HttpError, parseInput } from "../errors";
import { currentUser, requireAuth } from "../middleware";
import type { RateLimits } from "../rateLimits";
import { REFRESH_COOKIE } from "./auth";

const deleteSchema = z.object({ password: z.string().min(1, "Enter your password to confirm.").max(1024) });

export function accountRouter(limits: RateLimits): Router {
    const router = Router();

    /**
     * Deletes the account and everything hanging off it (interviews, transcripts, code, reports,
     * sessions) through the database's cascading deletes. Needs the password again so a stolen
     * access token alone can't destroy an account.
     */
    router.delete("/account", requireAuth, limits.account, async (req, res) => {
        const { password } = parseInput(deleteSchema, req.body);
        const { id } = currentUser(req);

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user || !(await verifyPassword(user.password, password))) {
            throw new HttpError(403, "That password isn't right.", "invalid_credentials");
        }

        await prisma.user.delete({ where: { id } });
        res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
        res.json({ msg: "Your account and all of its data have been deleted." });
    });

    return router;
}
