import { FORMAT_PRESETS, LEVEL_INDEX, ROUND_TITLES, roundKey, type Format, type InterviewPlan, type PlanItem, type PlanRound, type RoundSpec, type TalkItem } from "./plan";
import type { Analysis } from "./jdAnalysis";
import { getProblemDef, selectProblems, type Level } from "./problems";
import type { BankQuestion } from "./roleBanks";
import { relevanceNote } from "./signals";

export interface BuildPlanInput {
    role: string;
    level: Level;
    format: Format;
    analysis: Analysis;
    /** Makes problem selection reproducible for one interview. */
    seed: string;
}

const talk = (id: string, topic: string, prompt: string, lookFor: string[], followUps: string[], maxProbes: number, skill?: string): TalkItem => ({
    kind: "talk", id, topic, prompt, lookFor, followUps, maxProbes, skill,
});

function fromBank(id: string, q: BankQuestion, maxProbes: number): TalkItem {
    return talk(id, q.skill, q.question, q.lookFor, q.followUps, maxProbes, q.skill);
}

function itemsFor(spec: RoundSpec, key: string, input: BuildPlanInput, usedProblems: string[], leftovers: { technical: BankQuestion[] }): PlanItem[] {
    const { analysis, role, level } = input;
    const levelIndex = LEVEL_INDEX[level];

    switch (spec.type) {
        case "intro":
            return [talk(`${key}:0`, "Introduction",
                `Greet the candidate, introduce yourself as their interviewer for the ${role} role, briefly say how the session will run (a chat about their background, coding in an editor, some technical questions, and time for their questions), then ask them to introduce themselves.`,
                ["A concise summary of their experience", "Skills relevant to the role", "Why they are interested"], [], 1)];

        case "background":
            return analysis.background.slice(0, spec.count).map((b, i) => talk(`${key}:${i}`, b.topic, b.question, b.lookFor, [], 2));

        case "coding": {
            const problems = selectProblems({
                count: spec.count,
                level,
                preferredTags: analysis.jd.codingTags,
                tagWeights: analysis.signals.tags,
                exclude: usedProblems,
                seed: input.seed,
            });
            usedProblems.push(...problems);
            return problems.map((problemKey, i) => ({
                kind: "coding" as const,
                id: `${key}:${i}`,
                problemKey,
                why: relevanceNote(getProblemDef(problemKey)?.tags ?? [], analysis.signals) || undefined,
            }));
        }

        case "technical":
            return leftovers.technical.splice(0, spec.count).map((q, i) => fromBank(`${key}:${i}`, q, 2));

        case "system_design": {
            // Design questions assume production experience; junior candidates get more concept questions instead.
            if (levelIndex < 2 || !analysis.design) {
                return leftovers.technical.splice(0, Math.max(2, spec.count + 1)).map((q, i) => fromBank(`${key}:${i}`, q, 2));
            }
            const d = analysis.design;
            return [{ kind: "design" as const, id: `${key}:0`, title: d.title, prompt: d.prompt, lookFor: d.lookFor, maxProbes: 4 }];
        }

        case "behavioral":
            return analysis.behavioral.slice(0, spec.count).map((b, i) => talk(`${key}:${i}`, b.topic, b.question, b.lookFor, [], 2));

        case "wrapup":
            return [
                talk(`${key}:0`, "Candidate questions",
                    "Ask whether the candidate has any questions for you. Answer briefly and honestly. You are an AI interviewer with no inside knowledge of the company or team beyond the job description, so say so if asked something you can't know.",
                    [], [], 2),
                talk(`${key}:1`, "Closing",
                    "Close the interview warmly: thank them, say what you noticed at a high level without giving scores, and tell them a detailed report with a score and a study plan will be ready in about a minute.",
                    [], [], 0),
            ];
    }
}

/** Expands a format into rounds of concrete questions and problems. Deterministic for a given seed and analysis. */
export function buildPlan(input: BuildPlanInput): InterviewPlan {
    const preset = FORMAT_PRESETS[input.format];
    const usedProblems: string[] = [];
    const leftovers = { technical: [...input.analysis.technical] };

    const rounds: PlanRound[] = preset.rounds.map((spec, index) => {
        const key = roundKey(spec.type, index);
        // A design round swapped for concepts for junior candidates is presented as such.
        const swapped = spec.type === "system_design" && (LEVEL_INDEX[input.level] < 2 || !input.analysis.design);
        return {
            key,
            type: swapped ? "technical" : spec.type,
            title: swapped ? "Concepts and trade-offs" : ROUND_TITLES[spec.type],
            budgetMinutes: spec.minutes,
            items: itemsFor(spec, key, input, usedProblems, leftovers),
        };
    });

    // A round with nothing to ask (e.g. no coding problem matched) is dropped rather than left empty.
    const filled = rounds.filter((round) => round.items.length > 0);

    for (const round of filled) {
        for (const item of round.items) {
            if (item.kind === "coding" && !getProblemDef(item.problemKey)) throw new Error(`Plan references unknown problem "${item.problemKey}"`);
        }
    }

    return {
        version: 1,
        role: input.role,
        level: input.level,
        format: input.format,
        totalMinutes: preset.minutes,
        codingFollowUps: preset.codingFollowUps,
        maxCodingAttempts: 3,
        rounds: filled,
        jd: input.analysis.jd,
        analysisSource: input.analysis.source,
        keyterms: input.analysis.jd.keyterms.slice(0, 50),
        brief: input.analysis.brief,
        selection: { tags: input.analysis.signals.tags, themes: input.analysis.signals.themes, languages: input.analysis.signals.languages, seed: input.seed },
    };
}

/** What the client may see of a plan: round titles and timings, never questions or expected answers. */
export function publicPlanSummary(plan: InterviewPlan) {
    return {
        totalMinutes: plan.totalMinutes,
        format: plan.format,
        level: plan.level,
        role: plan.role,
        rounds: plan.rounds.map((round) => ({
            key: round.key,
            type: round.type,
            title: round.title,
            minutes: round.budgetMinutes,
            problems: round.items.filter((item) => item.kind === "coding").length || undefined,
        })),
    };
}
