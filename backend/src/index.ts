import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import { UrlsValidate } from "./validate";
import cors from "cors";
import { GithubScrape } from "./GithubScrape";
import { createInterviewSession, verifyModelAvailable } from "./services/llm";
import { putSession } from "./services/sessionStore";
import { runCode } from "./services/codeRunner";
import Router from "./serverWebrtc";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { authMiddleware, signAuthToken } from "./auth";
import type { AuthenticatedRequest } from "./auth";

const app = express();

const PORT = Number(process.env.PORT) || 2000;

app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:3000"];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(Router);

function setAuthCookie(req: Request, res: Response, token: string): void {
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.cookie("token", token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
}

// Auth Routes
app.post("/api/auth/signup", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            res.status(400).json({ msg: "Please enter all fields" });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ msg: "User already exists" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name
            }
        });

        const token = signAuthToken({ id: newUser.id, email: newUser.email, name: newUser.name });
        setAuthCookie(req, res, token);

        res.status(201).json({
            msg: "User registered successfully",
            userId: newUser.id,
            email: newUser.email,
            name: newUser.name,
            token
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ msg: "Server error" });
    }
});

app.post("/api/auth/signin", async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ msg: "Please enter all fields" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(400).json({ msg: "Invalid credentials" });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ msg: "Invalid credentials" });
            return;
        }

        const token = signAuthToken({ id: user.id, email: user.email, name: user.name });
        setAuthCookie(req, res, token);

        res.json({
            msg: "Signed in successfully",
            userId: user.id,
            email: user.email,
            name: user.name,
            token
        });
    } catch (error) {
        console.error("Signin error:", error);
        res.status(500).json({ msg: "Server error" });
    }
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("token");
    res.json({ msg: "Logged out successfully" });
});

app.get("/api/auth/me", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
});

app.post("/api/pre-interview", authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validate = UrlsValidate.safeParse(req.body);
    if (!validate.success) {
        res.status(411).json({ msg: "Invalid request parameters", errors: validate.error.issues });
        return;
    }

    const userId = req.user!.id;
    const { githubUrl, targetRole } = validate.data;

    // Extract github username if present
    const githubUrlUsername = githubUrl
        ? (githubUrl.endsWith("/") ? githubUrl.split("/").slice(0, -1).pop() : githubUrl.split("/").pop())
        : undefined;

    let githubRepos: any[] = [];
    if (githubUrlUsername) {
        try {
            console.log(`[Pre-Interview] Scraping GitHub for @${githubUrlUsername}...`);
            githubRepos = await GithubScrape(githubUrlUsername);
        } catch (err: any) {
            console.error("[Pre-Interview] GitHub scrape failed:", err.message);
        }
    }

    // Start a transcript scoped to this candidate. Replaces any earlier session
    // the same user left open, so every interview begins clean.
    putSession(createInterviewSession(userId, targetRole, githubUrlUsername, githubRepos));

    res.json({ githubUrlUsername, targetRole });
});


app.post("/api/execute-code", authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { code, language } = req.body;
        const output = await runCode(code, language);
        res.json({ output });
    } catch (err: any) {
        console.error("Code execution error:", err);
        res.status(500).json({ output: `Execution Exception: ${err.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`)
    // Surface a bad GROQ_MODEL now rather than as a silent interviewer mid-call.
    void verifyModelAvailable();
})
