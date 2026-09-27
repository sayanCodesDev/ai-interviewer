import type { Level } from "./problems";

export const LEVELS = ["intern", "junior", "mid", "senior", "staff"] as const;
export const FORMATS = ["quick", "standard", "full", "drill"] as const;
export type Format = (typeof FORMATS)[number];

export const LEVEL_INDEX: Record<Level, number> = { intern: 0, junior: 1, mid: 2, senior: 3, staff: 4 };

export type RoundType = "intro" | "background" | "coding" | "technical" | "system_design" | "behavioral" | "wrapup";

export interface TalkItem {
    kind: "talk";
    id: string;
    /** Short label, shown in the report ("Postgres indexing"). */
    topic: string;
    /** What to ask. The interviewer rephrases it naturally rather than reading it out. */
    prompt: string;
    /** What a strong answer covers. Guides follow-ups and later scoring. */
    lookFor: string[];
    followUps: string[];
    /** Follow-up turns allowed after the candidate's first answer. */
    maxProbes: number;
    skill?: string;
}

export interface CodingItem {
    kind: "coding";
    id: string;
    problemKey: string;
    /** What in the role or the candidate's work this problem speaks to ("scheduling and calendars"). Empty when nothing in particular. */
    why?: string;
}

export interface DesignItem {
    kind: "design";
    id: string;
    title: string;
    prompt: string;
    lookFor: string[];
    maxProbes: number;
}

export type PlanItem = TalkItem | CodingItem | DesignItem;

export interface PlanRound {
    key: string;
    type: RoundType;
    title: string;
    budgetMinutes: number;
    items: PlanItem[];
}

export interface JdAnalysis {
    title?: string;
    skills: Array<{ name: string; weight: number }>;
    keyterms: string[];
    codingTags: string[];
    behavioralFocus: string[];
}

/** What was learned about the candidate's work, kept with the plan so later problems can be chosen the same way. */
export interface PlanSelection {
    /** How strongly the role and work call for each problem topic. */
    tags: Record<string, number>;
    themes: string[];
    /** The languages the candidate works in that the editor supports, most used first. The editor opens in the first. */
    languages: string[];
    seed: string;
}

export interface InterviewPlan {
    version: 1;
    role: string;
    level: Level;
    format: Format;
    totalMinutes: number;
    /** Follow-up questions asked after each coding submission (complexity, then optimisation). */
    codingFollowUps: number;
    /** How many times a candidate may resubmit a failing solution before the interviewer moves on. */
    maxCodingAttempts: number;
    rounds: PlanRound[];
    jd: JdAnalysis | null;
    analysisSource: "llm" | "fallback";
    /** Technical vocabulary, fed to the speech recogniser so terms like "Kubernetes" transcribe correctly. */
    keyterms: string[];
    /** The interviewer's brief on the role and the candidate; sent with each turn in place of the full documents. */
    brief?: string;
    selection?: PlanSelection;
}

export interface RoundSpec {
    type: RoundType;
    minutes: number;
    /** Talk/design questions, or coding problems, in this round. */
    count: number;
}

export interface FormatPreset {
    label: string;
    minutes: number;
    description: string;
    codingFollowUps: number;
    rounds: RoundSpec[];
}

/** The shapes of interview a candidate can choose. Minutes add up to each format's length. */
export const FORMAT_PRESETS: Record<Format, FormatPreset> = {
    quick: {
        label: "Quick screen",
        minutes: 20,
        description: "A short phone-screen: introductions, your background, and one coding problem.",
        codingFollowUps: 2,
        rounds: [
            { type: "intro", minutes: 2, count: 1 },
            { type: "background", minutes: 3, count: 2 },
            { type: "coding", minutes: 12, count: 1 },
            { type: "wrapup", minutes: 3, count: 2 },
        ],
    },
    standard: {
        label: "Standard loop",
        minutes: 45,
        description: "Introductions, background, two coding problems, technical questions from the job description, and behavioral.",
        codingFollowUps: 2,
        rounds: [
            { type: "intro", minutes: 3, count: 1 },
            { type: "background", minutes: 6, count: 2 },
            { type: "coding", minutes: 18, count: 2 },
            { type: "technical", minutes: 9, count: 3 },
            { type: "behavioral", minutes: 6, count: 2 },
            { type: "wrapup", minutes: 3, count: 2 },
        ],
    },
    full: {
        label: "Full loop",
        minutes: 75,
        description: "The standard loop plus a third coding problem and a system-design round.",
        codingFollowUps: 2,
        rounds: [
            { type: "intro", minutes: 3, count: 1 },
            { type: "background", minutes: 7, count: 3 },
            { type: "coding", minutes: 27, count: 3 },
            { type: "technical", minutes: 14, count: 4 },
            { type: "system_design", minutes: 14, count: 1 },
            { type: "behavioral", minutes: 6, count: 2 },
            { type: "wrapup", minutes: 4, count: 2 },
        ],
    },
    drill: {
        label: "Coding drill",
        minutes: 30,
        description: "Only data structures and algorithms: four problems back to back with a quick complexity question after each.",
        codingFollowUps: 1,
        rounds: [
            { type: "intro", minutes: 1, count: 1 },
            { type: "coding", minutes: 26, count: 4 },
            { type: "wrapup", minutes: 3, count: 2 },
        ],
    },
};

export const ROUND_TITLES: Record<RoundType, string> = {
    intro: "Introduction",
    background: "Background and projects",
    coding: "Coding",
    technical: "Technical deep-dive",
    system_design: "System design",
    behavioral: "Behavioral",
    wrapup: "Wrap-up",
};

/** Hard ceiling on a call, whatever the format: a stuck interview can't run (and bill) forever. */
export function maxCallMinutes(format: Format): number {
    return FORMAT_PRESETS[format].minutes + 12;
}

export function roundKey(type: RoundType, index: number): string {
    return `${index + 1}-${type}`;
}
