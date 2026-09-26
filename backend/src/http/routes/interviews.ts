import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { LANGUAGES } from "../../runner/types";
import { publicPlanSummary } from "../../interview/planBuilder";
import { ACCENTS, VOICES, createInterview, createInterviewSchema, deleteInterview, ensurePlanning, getOwnedInterview, listInterviews, readPlan } from "../../interview/service";
import { FORMAT_PRESETS } from "../../interview/plan";
import { getProblemDef, runCustom, runExamples, validateArgs } from "../../interview/problems";
import { InterviewRecorder } from "../../interview/recorder";
import { pokeReportWorker } from "../../scoring/worker";
import { prisma } from "../../../lib/prisma";
import { ResumeError, MAX_RESUME_BYTES, extractResumeText } from "../../interview/resume";
import { SUPPORTED_ROLES } from "../../interview/roleBanks";
import { HttpError, parseInput } from "../errors";
import { currentUser, requireAuth } from "../middleware";
import type { RateLimits } from "../rateLimits";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 12, fieldSize: 24 * 1024, parts: 14 },
});

/** multer reports its own limit errors; turn them into the same clear responses as everything else. */
function acceptResume(req: Request, res: Response, next: NextFunction) {
    upload.single("resume")(req, res, (error: unknown) => {
        if (!error) return next();
        const code = (error as { code?: string }).code;
        if (code === "LIMIT_FILE_SIZE") return next(new HttpError(413, "That resume is larger than 2 MB.", "resume_too_large"));
        if (code === "LIMIT_UNEXPECTED_FILE") return next(new HttpError(400, "Attach the resume in the 'resume' field.", "bad_upload"));
        return next(new HttpError(400, "That upload couldn't be read.", "bad_upload"));
    });
}

const runSchema = z.object({
    problemKey: z.string().max(80),
    language: z.enum(LANGUAGES),
    code: z.string().min(1, "Write some code first.").max(100 * 1024, "That code is too long."),
    mode: z.enum(["examples", "custom"]),
    args: z.array(z.unknown()).max(12).optional(),
});

const listSchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.uuid().optional(),
});

const idSchema = z.uuid("That isn't a valid interview id.");

export function interviewsRouter(limits: RateLimits): Router {
    const router = Router();

    /** What the setup form needs to render its choices. Public, so the landing page can use it too. */
    router.get("/interview-options", (_req, res) => {
        res.json({
            roles: SUPPORTED_ROLES,
            levels: ["intern", "junior", "mid", "senior", "staff"],
            formats: Object.entries(FORMAT_PRESETS).map(([id, p]) => ({ id, label: p.label, minutes: p.minutes, description: p.description })),
            voices: VOICES,
            accents: ACCENTS,
        });
    });

    router.post("/interviews", requireAuth, limits.createInterview, acceptResume, async (req, res) => {
        const input = parseInput(createInterviewSchema, req.body ?? {});
        const user = currentUser(req);

        let resumeText: string | undefined;
        if (req.file) {
            try {
                resumeText = await extractResumeText({ buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname });
            } catch (error) {
                if (error instanceof ResumeError) throw new HttpError(400, error.message, "invalid_resume", { resume: error.message });
                throw error;
            }
        }

        const { id } = await createInterview(user.id, input, resumeText);
        res.status(201).json({ id });
    });

    router.get("/interviews", requireAuth, limits.reads, async (req, res) => {
        const { limit, cursor } = parseInput(listSchema, req.query);
        res.json(await listInterviews(currentUser(req).id, limit, cursor));
    });

    router.get("/interviews/:id", requireAuth, limits.reads, async (req, res) => {
        const id = parseInput(idSchema, req.params.id);
        const row = await getOwnedInterview(currentUser(req).id, id);
        ensurePlanning(row);

        const plan = readPlan(row);
        res.json({
            id: row.id,
            status: row.status,
            role: row.targetRole,
            level: row.level,
            format: row.format,
            durationMinutes: row.durationMinutes,
            voice: row.voice,
            planStatus: row.planStatus,
            planError: row.planStatus === "FAILED" ? "We couldn't prepare this interview. Try again." : null,
            plan: plan && row.planStatus === "READY" ? publicPlanSummary(plan) : null,
            analysisSource: plan?.analysisSource ?? null,
            reportStatus: row.reportStatus,
            createdAt: row.createdAt,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
        });
    });

    router.delete("/interviews/:id", requireAuth, limits.reads, async (req, res) => {
        await deleteInterview(currentUser(req).id, parseInput(idSchema, req.params.id));
        res.json({ msg: "Interview deleted." });
    });

    /**
     * "Run" from the editor: the visible examples, or one custom input. Graded submissions (which
     * include hidden tests) travel over the live call instead, so the interviewer can react to them.
     */
    router.post("/interviews/:id/run", requireAuth, limits.runCode, async (req, res) => {
        const id = parseInput(idSchema, req.params.id);
        const body = parseInput(runSchema, req.body);
        const row = await getOwnedInterview(currentUser(req).id, id);

        if (row.status !== "IN_PROGRESS") throw new HttpError(409, "You can only run code during a live interview.", "not_in_progress");
        const plan = readPlan(row);
        const planned = plan?.rounds.flatMap((r) => r.items).some((i) => i.kind === "coding" && i.problemKey === body.problemKey);
        const def = getProblemDef(body.problemKey);
        if (!planned || !def) throw new HttpError(404, "That problem isn't part of this interview.", "unknown_problem");

        let run;
        if (body.mode === "custom") {
            const args = body.args ?? [];
            const problem = validateArgs(def.signature, args);
            if (problem) throw new HttpError(400, problem, "invalid_input", { args: problem });
            run = await runCustom(def, body.language, body.code, args);
        } else {
            run = await runExamples(def, body.language, body.code);
        }

        // Keep a light record of iteration for the report; capped so it can't grow without bound.
        const recorder = new InterviewRecorder(id, Date.now());
        await recorder.addSubmission({ problemKey: def.key, kind: "RUN", attempt: 0, language: body.language, code: body.code, run });
        await recorder.close();

        res.json({ run });
    });

    /**
     * The report page's data: the transcript is available as soon as the interview ends, and the
     * scored report follows once it has been generated (the page polls while status is PENDING or GENERATING).
     */
    router.get("/interviews/:id/report", requireAuth, limits.reads, async (req, res) => {
        const id = parseInput(idSchema, req.params.id);
        const row = await getOwnedInterview(currentUser(req).id, id);
        if (row.status === "CREATED" || row.status === "IN_PROGRESS") throw new HttpError(409, "This interview hasn't finished yet.", "not_finished");

        const [turns, submissions, report] = await Promise.all([
            prisma.interviewTurn.findMany({ where: { interviewId: id }, orderBy: { seq: "asc" } }),
            prisma.codeSubmission.findMany({ where: { interviewId: id, kind: "SUBMIT" }, orderBy: { createdAt: "asc" } }),
            prisma.report.findUnique({ where: { interviewId: id } }),
        ]);
        const plan = readPlan(row);

        res.json({
            interview: {
                id: row.id, role: row.targetRole, level: row.level, format: row.format, status: row.status,
                startedAt: row.startedAt, endedAt: row.endedAt, endReason: row.endReason,
                rounds: plan?.rounds.map((r) => ({ key: r.key, title: r.title, type: r.type })) ?? [],
            },
            status: row.reportStatus,
            error: row.reportStatus === "FAILED" ? "We couldn't generate this report. You can try again." : null,
            report: report?.data ?? null,
            createdAt: report?.createdAt ?? null,
            transcript: turns.map((t) => ({ seq: t.seq, role: t.role.toLowerCase(), roundKey: t.roundKey, text: t.text, offsetMs: t.offsetMs, interrupted: t.interrupted })),
            submissions: submissions.map((s) => ({ problemKey: s.problemKey, attempt: s.attempt, language: s.language, code: s.code, passed: s.passed, total: s.total, status: s.status, at: s.createdAt })),
        });
    });

    /** Try again after a failed generation. Only allowed when it actually failed. */
    router.post("/interviews/:id/report/retry", requireAuth, limits.createInterview, async (req, res) => {
        const id = parseInput(idSchema, req.params.id);
        const row = await getOwnedInterview(currentUser(req).id, id);
        if (row.reportStatus !== "FAILED") throw new HttpError(409, "There's nothing to retry.", "not_failed");
        await prisma.interview.update({ where: { id }, data: { reportStatus: "PENDING", reportAttempts: 0, reportError: null } });
        pokeReportWorker();
        res.json({ status: "PENDING" });
    });

    return router;
}

