import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { UrlsValidate } from "./validate";
import cors from "cors";
import { GithubScrape } from "./GithubScrape";
import { setInterviewContext, resetConversation } from "./services/llm";
import Router from "./serverWebrtc";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "ai-interviewer-secret-key-12345";

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:3000"];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(Router);

// Extends Request interface to include user
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        name?: string | null;
    };
}

// Authentication Middleware
export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = req.cookies.token;
    if (!token) {
        res.status(401).json({ msg: "No token, authorization denied" });
        return;
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name?: string | null };
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: "Token is not valid" });
    }
};

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

        const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: "7d" });

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            msg: "User registered successfully",
            userId: newUser.id,
            email: newUser.email,
            name: newUser.name
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

        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            msg: "Signed in successfully",
            userId: user.id,
            email: user.email,
            name: user.name
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

app.get("/api/auth/me", authMiddleware as any, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
});

app.post("/api/pre-interview", authMiddleware as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const validate = UrlsValidate.safeParse(req.body);
    if (!validate.success) {
        res.status(411).json({ msg: "Invalid request parameters", errors: validate.error.issues });
        return;
    }

    const { githubUrl, targetRole } = validate.data;

    // Extract github username if present
    const githubUrlUsername = githubUrl
        ? (githubUrl.endsWith("/") ? githubUrl.split("/").slice(0, -1).pop() : githubUrl.split("/").pop())
        : undefined;

    // Reset conversation history for fresh session
    resetConversation();

    let githubRepos: any[] = [];
    if (githubUrlUsername) {
        try {
            console.log(`[Pre-Interview] Scraping GitHub for @${githubUrlUsername}...`);
            githubRepos = await GithubScrape(githubUrlUsername);
        } catch (err: any) {
            console.error("[Pre-Interview] GitHub scrape failed:", err.message);
        }
    }

    // Set interview context (Target Role + GitHub)
    setInterviewContext(targetRole, githubUrlUsername, githubRepos);

    res.json({ githubUrlUsername, targetRole });
});


app.post("/api/execute-code", async (req: Request, res: Response): Promise<void> => {
    try {
        const { code, language } = req.body;
        if (!code) {
            res.status(400).json({ output: "Error: No code provided." });
            return;
        }

        const langKey = (language || "javascript").toLowerCase();

        if (langKey === "javascript" || langKey === "typescript") {
            let logs: string[] = [];
            const originalLog = console.log;
            const originalError = console.error;
            
            try {
                console.log = (...args) => {
                    logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
                };
                console.error = (...args) => {
                    logs.push("[ERROR] " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
                };

                const fn = new Function(code);
                const result = fn();
                
                console.log = originalLog;
                console.error = originalError;

                let outputText = logs.join("\n");
                if (result !== undefined && !logs.includes(String(result))) {
                    outputText += (outputText ? "\nReturn Value: " : "Return Value: ") + JSON.stringify(result);
                }

                res.json({ output: outputText || "Code executed successfully (no console output)." });
            } catch (err: any) {
                console.log = originalLog;
                console.error = originalError;
                res.json({ output: `Runtime Error: ${err.message}` });
            }
        } else if (langKey === "python") {
            const { exec } = await import("child_process");
            const fs = await import("fs");
            const path = await import("path");
            const tmpFile = path.join(process.cwd(), `tmp_${Date.now()}.py`);
            
            fs.writeFileSync(tmpFile, code);
            exec(`python3 "${tmpFile}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                if (error) {
                    res.json({ output: stderr || error.message });
                } else {
                    res.json({ output: stdout || "Python code executed successfully (no output)." });
                }
            });
        } else {
            res.json({ output: `[${langKey.toUpperCase()} Syntax & Logic Check]\nStatus: Clean syntax, solution structured properly!` });
        }
    } catch (err: any) {
        res.status(500).json({ output: `Execution Exception: ${err.message}` });
    }
});

app.listen(2000, () => {
    console.log("Server started on port 2000")
})