import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { config } from "../config/env";
import { HttpError } from "../http/errors";
import { logger } from "../observability/logger";
import { analyseCandidate } from "./jdAnalysis";
import { fetchGithubProfile, parseGithubInput, verifyGithubUser } from "./github";
import { FORMATS, FORMAT_PRESETS, LEVELS, type Format, type InterviewPlan } from "./plan";
import { buildPlan } from "./planBuilder";
import { warmExpected, type Level } from "./problems";
import { SUPPORTED_ROLES } from "./roleBanks";
import { sanitizeUntrusted } from "./untrusted";

/** Interviewer voices offered at setup. The first is the default. */
export const VOICES = [
    { id: "aura-2-thalia-en", name: "Thalia", description: "Clear and confident" },
    { id: "aura-2-andromeda-en", name: "Andromeda", description: "Warm and casual" },
    { id: "aura-2-helena-en", name: "Helena", description: "Friendly and caring" },
    { id: "aura-2-apollo-en", name: "Apollo", description: "Confident and comfortable" },
    { id: "aura-2-orion-en", name: "Orion", description: "Approachable and calm" },
    { id: "aura-2-arcas-en", name: "Arcas", description: "Natural and smooth" },
    { id: "aura-2-zeus-en", name: "Zeus", description: "Deep and trustworthy" },
    { id: "aura-2-luna-en", name: "Luna", description: "Friendly and engaging" },
] as const;

export const ACCENTS = [
    { id: "en", label: "English (general)" },
    { id: "en-US", label: "English (US)" },
    { id: "en-GB", label: "English (UK)" },
    { id: "en-IN", label: "English (India)" },
    { id: "en-AU", label: "English (Australia)" },
] as const;

/** A job description shorter than this cannot say what the role needs, so the questions could not follow it. */
export const MIN_JOB_DESCRIPTION_CHARS = 60;

export const createInterviewSchema = z.object({
    role: z.enum(SUPPORTED_ROLES as [string, ...string[]], { error: "Choose one of the listed roles." }),
    level: z.enum(LEVELS, { error: "Choose your level." }).default("mid"),
    format: z.enum(FORMATS, { error: "Choose an interview format." }).default("standard"),
    // Both are required: the interview is built from the job description and the candidate's own projects, like a real loop.
    jobDescription: z
        .string({ error: "Paste the job description: the interview is built from it." })
        .trim()
        .min(MIN_JOB_DESCRIPTION_CHARS, `That is too short to be a job description. Paste the whole thing (at least ${MIN_JOB_DESCRIPTION_CHARS} characters) so the questions fit the role.`)
        .max(6_000, "The job description is limited to 6,000 characters."),
    // Optional: what the job description alone often leaves vague. Folded into the same analysis.
    responsibilities: z.string().trim().max(2_000, "Keep responsibilities to 2,000 characters.").optional(),
    githubUrl: z
        .string({ error: "Add your GitHub profile: the interviewer asks about your real projects." })
        .trim()
        .min(1, "Add your GitHub profile link or username.")
        .max(200),
    voice: z.enum(VOICES.map((v) => v.id) as [string, ...string[]]).default(VOICES[0].id),
    accent: z.enum(ACCENTS.map((a) => a.id) as [string, ...string[]]).default("en"),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

// ------------------------------------------------------------------------------------------ creating

const DAY_MS = 24 * 60 * 60 * 1000;

/** Creates the interview row and starts planning in the background. The candidate can go straight to the lobby. */
export async function createInterview(userId: string, input: CreateInterviewInput, resumeText?: string): Promise<{ id: string; githubVerified: boolean }> {
    if (config.maxInterviewsPerDay > 0) {
        const recent = await prisma.interview.count({ where: { userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
        if (recent >= config.maxInterviewsPerDay) {
            throw new HttpError(429, `You've reached today's limit of ${config.maxInterviewsPerDay} interviews. Try again tomorrow.`, "daily_limit");
        }
    }

    const githubUsername = parseGithubInput(input.githubUrl);
    if (!githubUsername) throw new HttpError(400, "That doesn't look like a GitHub username or profile link.", "invalid_github", { githubUrl: "Use a link like https://github.com/your-username." });
    // A typo here would quietly cost the candidate the questions about their own projects. If GitHub can't be asked, don't block them —
    // but "couldn't ask" (rate-limited, a network hiccup) is still worth telling them about, so they know why their real
    // projects didn't come up, rather than wondering silently. githubVerified carries that back to the caller.
    const check = await verifyGithubUser(githubUsername);
    if (check === "missing") {
        throw new HttpError(400, `We couldn't find a GitHub account called ${githubUsername}.`, "github_not_found", { githubUrl: `There is no GitHub account called ${githubUsername}. Check the spelling.` });
    }

    const preset = FORMAT_PRESETS[input.format];
    const created = await prisma.interview.create({
        data: {
            userId,
            targetRole: input.role,
            level: input.level,
            format: input.format,
            durationMinutes: preset.minutes,
            jobDescription: sanitizeUntrusted(input.jobDescription, 6_000),
            responsibilities: input.responsibilities ? sanitizeUntrusted(input.responsibilities, 2_000) : null,
            resumeText: resumeText ?? null,
            githubUsername,
            voice: input.voice,
            accent: input.accent,
        },
        select: { id: true },
    });

    void preparePlan(created.id);
    return { id: created.id, githubVerified: check === "found" };
}

// ------------------------------------------------------------------------------------- continuing

/** Which study-plan topics from a finished report to weight the next interview toward. */
export type ContinueTopics = "all" | string[];

/**
 * A "Practice this" retry: same role, level, job description and GitHub as the source interview, but the
 * coding problems and question order lean toward the study-plan topics the candidate chose to revisit. Grouped
 * with the source under one trackId so the dashboard and the interviewer's own memory can follow the sequence.
 */
export async function continueInterview(userId: string, sourceId: string, topicsInput: ContinueTopics): Promise<{ id: string }> {
    const source = await getOwnedInterview(userId, sourceId);
    const report = await prisma.report.findUnique({ where: { interviewId: sourceId } });
    if (!report) throw new HttpError(400, "That interview doesn't have a report yet.", "no_report");
    const studyPlan = ((report.data as { studyPlan?: Array<{ topic: string }> } | null)?.studyPlan ?? []) as Array<{ topic: string }>;
    if (studyPlan.length === 0) throw new HttpError(400, "That report has no study plan to practise.", "no_study_plan");

    const topics = topicsInput === "all" ? studyPlan.map((s) => s.topic) : topicsInput.filter((t) => studyPlan.some((s) => s.topic === t));
    if (topics.length === 0) throw new HttpError(400, "Choose at least one study-plan topic to practise.", "no_topics");

    if (config.maxInterviewsPerDay > 0) {
        const recent = await prisma.interview.count({ where: { userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
        if (recent >= config.maxInterviewsPerDay) {
            throw new HttpError(429, `You've reached today's limit of ${config.maxInterviewsPerDay} interviews. Try again tomorrow.`, "daily_limit");
        }
    }

    // Position within the track: highest so far, plus one — so retrying from an earlier attempt in a track
    // (not just the latest) still moves the track forward instead of colliding with a later position.
    const highest = await prisma.interview.aggregate({ where: { trackId: source.trackId }, _max: { trackPosition: true } });
    const trackPosition = Math.max(highest._max.trackPosition ?? 0, source.trackPosition) + 1;

    const preset = FORMAT_PRESETS[source.format as Format];
    const created = await prisma.interview.create({
        data: {
            userId,
            targetRole: source.targetRole,
            level: source.level,
            format: source.format,
            durationMinutes: preset.minutes,
            jobDescription: source.jobDescription,
            responsibilities: source.responsibilities,
            resumeText: source.resumeText,
            githubUsername: source.githubUsername,
            voice: source.voice,
            accent: source.accent,
            trackId: source.trackId,
            trackPosition,
            continuesFromId: source.id,
            continuesTopics: topics,
        },
        select: { id: true },
    });

    void preparePlan(created.id);
    return created;
}

// ------------------------------------------------------------------------------------------- planning

const planning = new Set<string>();

/**
 * Re-derives coding-topic weights and an interviewer memory line from a source interview's study plan, for the
 * topics this retry chose. Nothing is stored on the row itself beyond the topic names: the source report already
 * holds the detail, so re-reading it here is the one place this can drift out of sync.
 */
async function practiceContext(sourceInterviewId: string, topics: string[]): Promise<{ tagWeights?: Record<string, number>; memoryNote?: string }> {
    if (topics.length === 0) return {};
    const report = await prisma.report.findUnique({ where: { interviewId: sourceInterviewId } });
    const studyPlan = (report?.data as { studyPlan?: Array<{ topic: string; why: string; priority: string; problemTags?: string[] }> } | null)?.studyPlan ?? [];
    const chosen = studyPlan.filter((item) => topics.includes(item.topic));
    if (chosen.length === 0) return {};

    const weights: Record<string, number> = {};
    for (const item of chosen) {
        const base = item.priority === "high" ? 6 : item.priority === "low" ? 3.5 : 4.5;
        for (const tag of item.problemTags ?? []) weights[tag] = (weights[tag] ?? 0) + base;
    }

    const memoryNote = `This candidate interviewed with you before and came back specifically to practise: ${chosen.map((c) => c.topic).join("; ")}. ${chosen[0]!.why} Acknowledge once, naturally, near the start that this continues their last interview; do not reintroduce yourself as a stranger, and do not read this note aloud.`;

    return { tagWeights: Object.keys(weights).length > 0 ? weights : undefined, memoryNote };
}

/**
 * Turns the setup answers into a concrete interview: reads GitHub, analyses the job description and
 * resume, picks problems, and starts computing their expected outputs. Idempotent, and safe to call
 * from any instance: a candidate polling the lobby re-triggers it if the instance that began it died.
 */
export async function preparePlan(interviewId: string): Promise<void> {
    if (planning.has(interviewId)) return;
    planning.add(interviewId);
    try {
        const row = await prisma.interview.findUnique({ where: { id: interviewId } });
        if (!row || row.planStatus === "READY") return;

        const github = row.githubUsername ? await fetchGithubProfile(row.githubUsername) : null;
        // Responsibilities is a separate field in the form, but one analysis: fold it into the same job
        // description text so every consumer (signals, keyterms, the model's own reading of the role) sees it
        // without needing to know there are two fields.
        const jobDescription = [row.jobDescription, row.responsibilities ? `Key responsibilities:\n${row.responsibilities}` : ""].filter(Boolean).join("\n\n") || undefined;
        const practice = row.continuesFromId ? await practiceContext(row.continuesFromId, row.continuesTopics) : {};
        const cached = await analyseCandidate({
            role: row.targetRole,
            level: row.level as Level,
            jobDescription,
            resumeText: row.resumeText ?? undefined,
            github,
            seed: interviewId,
            extraTagWeights: practice.tagWeights,
        });
        // analyseCandidate's result can be a cached, shared object (retries deliberately reuse their source's
        // role/level/JD/resume/github, which is exactly the cache key) — copy rather than mutate before adding
        // a note that is specific to this one interview.
        const analysis = practice.memoryNote ? { ...cached, brief: [cached.brief, practice.memoryNote].filter(Boolean).join("\n\n") } : cached;
        const plan = buildPlan({ role: row.targetRole, level: row.level as Level, format: row.format as Format, analysis, seed: interviewId });

        warmExpected(plan.rounds.flatMap((r) => r.items).flatMap((i) => (i.kind === "coding" ? [i.problemKey] : [])));

        await prisma.interview.update({
            where: { id: interviewId },
            data: { plan: plan as unknown as Prisma.InputJsonValue, planStatus: "READY", planError: null },
        });
    } catch (error) {
        logger.error({ err: error, interviewId }, "Could not prepare the interview plan");
        await prisma.interview
            .update({ where: { id: interviewId }, data: { planStatus: "FAILED", planError: String((error as Error).message).slice(0, 300) } })
            .catch(() => undefined);
    } finally {
        planning.delete(interviewId);
    }
}

/** Starts planning again if it stalled (the instance that began it went away) or failed. */
export function ensurePlanning(row: { id: string; planStatus: string; createdAt: Date; updatedAt: Date }): void {
    const stale = Date.now() - row.updatedAt.getTime() > 45_000;
    if ((row.planStatus === "PENDING" && stale) || row.planStatus === "FAILED") {
        if (row.planStatus === "FAILED") void prisma.interview.update({ where: { id: row.id }, data: { planStatus: "PENDING", planError: null } }).then(() => preparePlan(row.id));
        else void preparePlan(row.id);
    }
}

// -------------------------------------------------------------------------------------------- reading

/** The interview, only if it belongs to this user. A stranger's id looks exactly like one that doesn't exist. */
export async function getOwnedInterview(userId: string, id: string) {
    const row = await prisma.interview.findFirst({ where: { id, userId } });
    if (!row) throw new HttpError(404, "Interview not found.", "not_found");
    return row;
}

export function readPlan(row: { plan: Prisma.JsonValue | null }): InterviewPlan | null {
    return (row.plan as unknown as InterviewPlan | null) ?? null;
}

export async function listInterviews(userId: string, limit: number, cursor?: string) {
    const rows = await prisma.interview.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
            id: true, targetRole: true, level: true, format: true, status: true, createdAt: true, startedAt: true, endedAt: true,
            reportStatus: true, report: { select: { overallScore: true, band: true } },
        },
    });
    const page = rows.slice(0, limit);
    return {
        items: page.map((r) => ({
            id: r.id,
            role: r.targetRole,
            level: r.level,
            format: r.format,
            status: r.status,
            createdAt: r.createdAt,
            durationSeconds: r.startedAt && r.endedAt ? Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 1000) : null,
            reportStatus: r.reportStatus,
            score: r.report?.overallScore ?? null,
            band: r.report?.band ?? null,
        })),
        nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
}

export async function deleteInterview(userId: string, id: string): Promise<void> {
    await getOwnedInterview(userId, id);
    await prisma.interview.delete({ where: { id } });
}

// ------------------------------------------------------------------------------------------ lifecycle

export async function markStarted(id: string): Promise<void> {
    await prisma.interview.updateMany({ where: { id, status: "CREATED" }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
}

/**
 * Closes out an interview. One with almost nothing in it is marked abandoned and gets no report,
 * rather than producing a confident-sounding assessment of a sentence or two.
 */
export async function finishInterview(id: string, reason: string): Promise<{ substantive: boolean }> {
    const [candidateTurns, submissions] = await Promise.all([
        prisma.interviewTurn.count({ where: { interviewId: id, role: "CANDIDATE" } }),
        prisma.codeSubmission.count({ where: { interviewId: id, kind: "SUBMIT" } }),
    ]);
    const substantive = candidateTurns >= 3 || submissions >= 1;

    await prisma.interview.updateMany({
        where: { id, status: { in: ["CREATED", "IN_PROGRESS"] } },
        data: {
            status: substantive ? "COMPLETED" : "ABANDONED",
            endedAt: new Date(),
            endReason: reason,
            reportStatus: substantive ? "PENDING" : "NONE",
        },
    });
    return { substantive };
}
