// Interim routes carried over from the first version. Replaced by the interviews API in phase 3.
import { Router } from "express";
import { UrlsValidate } from "../../validate";
import { GithubScrape } from "../../GithubScrape";
import { createInterviewSession } from "../../services/llm";
import { putSession } from "../../services/sessionStore";
import { runCode } from "../../services/codeRunner";
import { HttpError, parseInput } from "../errors";
import { currentUser, requireAuth } from "../middleware";
import type { RateLimits } from "../rateLimits";

const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function legacyRouter(limits: RateLimits): Router {
    const router = Router();

    router.post("/pre-interview", requireAuth, limits.createInterview, async (req, res) => {
        const { githubUrl, targetRole } = parseInput(UrlsValidate, req.body);
        const userId = currentUser(req).id;

        // The last path segment is used as a GitHub username in an outbound URL, so it must be a real one.
        const segments = githubUrl?.trim().replace(/\/+$/, "").split("/") ?? [];
        const githubUrlUsername = segments.length > 0 ? segments[segments.length - 1] : undefined;
        if (githubUrlUsername && !GITHUB_USERNAME.test(githubUrlUsername)) {
            throw new HttpError(400, "That doesn't look like a GitHub username or profile link.", "invalid_github");
        }

        let githubRepos: Awaited<ReturnType<typeof GithubScrape>> = [];
        if (githubUrlUsername) githubRepos = await GithubScrape(githubUrlUsername);

        putSession(createInterviewSession(userId, targetRole, githubUrlUsername, githubRepos));
        res.json({ githubUrlUsername, targetRole });
    });

    router.post("/execute-code", requireAuth, limits.runCode, async (req, res) => {
        const { code, language } = req.body ?? {};
        res.json({ output: await runCode(code, language) });
    });

    return router;
}
