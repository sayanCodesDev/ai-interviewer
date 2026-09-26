import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { InterviewPlan } from "../interview/plan";
import { evaluateInterview, type ReportData } from "./evaluate";
import type { SubmissionRow, TurnRow } from "./metrics";

/** Loads a finished interview, has it evaluated, and stores the result. Throws on any failure so the worker can retry. */
export async function generateReport(interviewId: string): Promise<ReportData> {
    const row = await prisma.interview.findUnique({
        where: { id: interviewId },
        include: { turns: { orderBy: { seq: "asc" } }, submissions: true },
    });
    if (!row) throw new Error("Interview not found.");
    const plan = row.plan as unknown as InterviewPlan | null;
    if (!plan) throw new Error("Interview has no plan.");

    const turns: TurnRow[] = row.turns.map((t) => ({ seq: t.seq, role: t.role, roundKey: t.roundKey, text: t.text, offsetMs: t.offsetMs, interrupted: t.interrupted }));
    const submissions: SubmissionRow[] = row.submissions.map((s) => ({
        problemKey: s.problemKey, kind: s.kind, attempt: s.attempt, language: s.language, code: s.code,
        passed: s.passed, total: s.total, status: s.status, createdAt: s.createdAt,
    }));

    const report = await evaluateInterview({
        interview: { id: row.id, targetRole: row.targetRole, level: row.level, durationMinutes: row.durationMinutes, startedAt: row.startedAt, endedAt: row.endedAt },
        plan,
        turns,
        submissions,
    });

    const data = report as unknown as Prisma.InputJsonValue;
    const fields = { overallScore: report.overall.score, band: report.overall.band, summary: report.summary, data, model: report.generatedBy.model, promptVersion: report.generatedBy.promptVersion };
    await prisma.$transaction([
        prisma.report.upsert({ where: { interviewId }, create: { interviewId, ...fields }, update: fields }),
        prisma.interview.update({ where: { id: interviewId }, data: { reportStatus: "READY", reportError: null } }),
    ]);
    return report;
}
