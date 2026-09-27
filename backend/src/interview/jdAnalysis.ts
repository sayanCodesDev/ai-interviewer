import crypto from "node:crypto";
import { z } from "zod";
import { completeJson } from "../llm/json";
import { models } from "../llm/client";
import { logger } from "../observability/logger";
import { summariseGithub, type GithubProfile } from "./github";
import { LEVEL_INDEX, type JdAnalysis } from "./plan";
import { KNOWN_TAGS, seededShuffle, type Level } from "./problems";
import { BEHAVIORAL_BANK, GENERIC_BACKGROUND, getRoleBank, levelLabel, type BackgroundQuestion, type BankQuestion, type DesignPrompt } from "./roleBanks";
import { extractSignals, type Signals } from "./signals";
import { UNTRUSTED_NOTICE, sanitizeUntrusted, untrustedBlock } from "./untrusted";

export interface AnalysisInput {
    role: string;
    level: Level;
    jobDescription?: string;
    resumeText?: string;
    github?: GithubProfile | null;
    /** Breaks ties between equally relevant bank questions so two interviews for the same role and level do
     * not open with the identical set every time. Falls back to the role and level, which is still better
     * than a fixed order but repeats for the same candidate asking again with the same everything. */
    seed?: string;
}

export interface BehavioralQuestion {
    topic: string;
    question: string;
    lookFor: string[];
}

/** Everything the plan builder needs to turn a format into concrete questions. */
export interface Analysis {
    jd: JdAnalysis;
    technical: BankQuestion[];
    background: BackgroundQuestion[];
    behavioral: BehavioralQuestion[];
    design: DesignPrompt | null;
    /** A few lines for the interviewer: the role's focus and what the candidate's own material shows. */
    brief: string;
    /** What the candidate's material says about the work: which problem topics fit, and which language they use. */
    signals: Signals;
    source: "llm" | "fallback";
}

// --- schema for the model's reply. Strings are truncated rather than rejected: a slightly long
// --- sentence should not cost a retry.

const text = (max: number) => z.string().transform((value) => value.trim().slice(0, max));
const list = (max: number, itemMax: number) => z.array(text(itemMax)).transform((items) => items.filter(Boolean).slice(0, max));

const replySchema = z.object({
    title: text(120).optional(),
    brief: text(900).optional(),
    skills: z.array(z.object({ name: text(60), weight: z.coerce.number().min(1).max(5).catch(3) })).transform((s) => s.filter((x) => x.name).slice(0, 12)),
    keyterms: list(60, 40),
    codingTags: list(8, 40),
    backgroundQuestions: z
        .array(z.object({ question: text(400), topic: text(60).optional(), lookFor: list(5, 200).optional() }))
        .transform((qs) => qs.filter((x) => x.question).slice(0, 4))
        .default([]),
    technicalQuestions: z
        .array(z.object({ question: text(500), skill: text(60).optional(), lookFor: list(6, 220), followUps: list(3, 240).optional() }))
        .transform((qs) => qs.filter((x) => x.question && x.lookFor.length > 0).slice(0, 8))
        .refine((qs) => qs.length >= 3, "provide at least 3 technicalQuestions, each with lookFor items"),
    behavioralQuestions: z
        .array(z.object({ question: text(400), topic: text(60).optional(), lookFor: list(5, 200).optional() }))
        .transform((qs) => qs.filter((x) => x.question).slice(0, 3))
        .default([]),
    design: z.object({ title: text(100), prompt: text(600), lookFor: list(6, 220) }).optional().nullable(),
});

const SHAPE = `{
  "title": "job title, if stated",
  "brief": "4 to 6 short plain lines for the interviewer: what the role really needs, what the candidate's resume and repositories show (name real projects), and what to probe. No more than 120 words",
  "skills": [{"name": "skill", "weight": 1-5}],
  "keyterms": ["technical terms a speech recogniser might mishear: tools, frameworks, acronyms"],
  "codingTags": ["algorithm topics that matter for this role, chosen ONLY from: ${KNOWN_TAGS.join(", ")}"],
  "backgroundQuestions": [{"question": "about THEIR resume or projects", "topic": "short label", "lookFor": ["..."]}],
  "technicalQuestions": [{"question": "answerable aloud in 2-4 minutes", "skill": "skill tested", "lookFor": ["what a strong answer covers"], "followUps": ["one deeper probe"]}],
  "behavioralQuestions": [{"question": "...", "topic": "...", "lookFor": ["..."]}],
  "design": {"title": "...", "prompt": "a system-design scenario suited to the role", "lookFor": ["..."]}
}`;

function buildMessages(input: AnalysisInput) {
    const system = `You design realistic mock technical interviews, like an experienced hiring manager. Reply with ONE JSON object and nothing else.

Target role: ${input.role}. Level: ${levelLabel(input.level)}.

Rules:
- Base the questions on the skills the job description emphasises and on the candidate's real experience. If a source is missing, fall back on what is typical for the role and level.
- Calibrate to the level: interns and juniors get fundamentals; seniors and staff get trade-offs, scale and judgment.
- Every question must work in a spoken conversation. No question may need a whiteboard, a diagram, or code on screen.
- Give 5 to 8 technicalQuestions, 2 to 3 backgroundQuestions that reference the candidate's actual resume or repositories by name, and 2 behavioralQuestions.
- lookFor lists the points a strong answer would cover, so the interviewer can judge and probe.
- ${UNTRUSTED_NOTICE}

JSON shape:
${SHAPE}`;

    const blocks = [
        input.jobDescription ? untrustedBlock("job description", sanitizeUntrusted(input.jobDescription, 6_000)) : "",
        input.resumeText ? untrustedBlock("resume", sanitizeUntrusted(input.resumeText, 6_000)) : "",
        input.github ? untrustedBlock("github repositories", summariseGithub(input.github)) : "",
    ].filter(Boolean);

    return [
        { role: "system" as const, content: system },
        { role: "user" as const, content: blocks.join("\n\n") || "No job description or resume was provided. Use the role and level only." },
    ];
}

// ---------------------------------------------------------------------------------------- fallback

/** Enough questions to fill the longest format (a technical round plus a concepts round) at any level. */
const MIN_QUESTIONS = 8;

const STOP_WORDS = new Set(["about", "which", "their", "there", "would", "could", "should", "these", "those", "where", "while", "being", "other", "between", "through", "using", "make", "your", "with", "that", "this", "from", "have", "what", "when", "will", "into", "also", "than", "then", "they", "them", "does", "must", "team", "work", "experience", "role", "years", "strong", "ability", "including", "across", "build", "building", "such", "well", "over", "more", "most", "each", "like", "need", "help"]);

function tokensOf(text: string): string[] {
    return (text.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) ?? []).map((t) => t.replace(/\.+$/, "")).filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/** The words in the candidate's job description, resume and repositories: what to match the question bank against. */
function corpusTokens(input: AnalysisInput): Set<string> {
    return new Set(tokensOf([input.jobDescription ?? "", input.resumeText ?? "", summariseGithub(input.github ?? null)].join("\n")));
}

/** How much of what a question is about the candidate's own material mentions. The skill name counts most. */
function questionRelevance(question: BankQuestion, corpus: Set<string>): number {
    const skill = new Set(tokensOf(question.skill));
    const body = new Set(tokensOf([question.question, ...question.lookFor, ...question.followUps].join(" ")));
    let score = 0;
    for (const token of skill) if (corpus.has(token)) score += 3;
    for (const token of body) if (corpus.has(token)) score += 1;
    return score;
}

function questionsForLevel(role: string, level: Level, corpus: Set<string> = new Set(), seed = `${role}:${level}`): BankQuestion[] {
    const bank = getRoleBank(role);
    const index = LEVEL_INDEX[level];
    const eligible = bank.technical.filter((question) => question.minLevel <= index);
    // Shuffled first so that when relevance and level tie — the common case without a job description that
    // singles anything out — which of the tied questions comes first still varies per interview, instead of
    // always the order they happen to be written in the bank. Array.sort is stable, so this only ever
    // changes the order WITHIN a tie: relevance and level still decide everything the seed doesn't.
    const shuffled = seededShuffle(`${seed}:technical`, eligible);
    // What the job description and the candidate's own work mention first; then harder questions first for senior candidates, fundamentals first for juniors.
    const ordered = shuffled.sort((a, b) => questionRelevance(b, corpus) - questionRelevance(a, corpus) || (index >= 3 ? b.minLevel - a.minLevel : a.minLevel - b.minLevel));
    if (ordered.length >= MIN_QUESTIONS) return ordered;

    // A junior picking a leadership-heavy role still deserves a full interview: borrow the gentlest of the rest.
    const rest = seededShuffle(`${seed}:rest`, bank.technical.filter((question) => question.minLevel > index)).sort((a, b) => a.minLevel - b.minLevel);
    return [...ordered, ...rest.slice(0, MIN_QUESTIONS - ordered.length)];
}

function behavioralForLevel(level: Level, seed: string = level): BehavioralQuestion[] {
    const index = LEVEL_INDEX[level];
    return seededShuffle(`${seed}:behavioral`, BEHAVIORAL_BANK.filter((b) => b.minLevel <= index))
        .sort((a, b) => (index >= 3 ? b.minLevel - a.minLevel : a.minLevel - b.minLevel))
        .map(({ topic, question, lookFor }) => ({ topic, question, lookFor }));
}

/** Questions about the candidate's own projects, from their public repositories: the ones with something written about them first. */
function githubBackground(github: GithubProfile | null | undefined): BackgroundQuestion[] {
    const repos = [...(github?.repos ?? [])].sort((a, b) => Number(Boolean(b.description || b.readme)) - Number(Boolean(a.description || a.readme)) || b.stars - a.stars);
    return repos.slice(0, 2).map((repo, i) => {
        const about = repo.description ? ` It's described as "${repo.description.replace(/["\n]/g, " ").slice(0, 120)}".` : "";
        return {
            topic: `Project: ${repo.name}`,
            question: i === 0
                ? `I saw a project of yours called ${repo.name}${repo.language ? `, written in ${repo.language}` : ""}.${about} What was it for, and what was the hardest technical decision you made in it?`
                : `You also have ${repo.name}${repo.language ? ` in ${repo.language}` : ""}.${about} If you started it again today, what would you do differently?`,
            lookFor: i === 0
                ? ["Clear purpose and scope", "A specific technical decision and its trade-offs", "What they would do differently"]
                : ["Honest reflection on what they got wrong", "Concrete improvements, not generalities", "Understanding of the trade-offs they accepted"],
        };
    });
}

/** Role-and-level questions from the hand-written bank. Used when there is nothing to analyse, or the model fails. */
export function fallbackAnalysis(input: AnalysisInput): Analysis {
    const bank = getRoleBank(input.role);
    const jd = input.jobDescription?.trim();
    return {
        source: "fallback",
        brief: [`Role focus: ${bank.focusAreas.join("; ")}.`, jd ? `Job description (start): ${sanitizeUntrusted(jd, 500)}` : "", input.github?.repos.length ? `Recent repositories: ${input.github.repos.slice(0, 4).map((r) => r.name).join(", ")}.` : ""].filter(Boolean).join("\n"),
        jd: {
            skills: bank.focusAreas.map((name) => ({ name, weight: 3 })),
            keyterms: bank.keyterms,
            codingTags: bank.codingTags,
            behavioralFocus: [],
        },
        signals: extractSignals({ role: input.role, jobDescription: input.jobDescription, resumeText: input.resumeText, github: input.github, roleTags: bank.codingTags }),
        technical: questionsForLevel(input.role, input.level, corpusTokens(input), input.seed),
        background: [...githubBackground(input.github), ...GENERIC_BACKGROUND],
        behavioral: behavioralForLevel(input.level, input.seed),
        design: bank.design[0] ?? null,
    };
}

// ------------------------------------------------------------------------------------------ analysis

const cache = new Map<string, { at: number; value: Promise<Analysis> }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(input: AnalysisInput): string {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify([input.role, input.level, input.jobDescription ?? "", input.resumeText ?? "", summariseGithub(input.github ?? null)]))
        .digest("hex");
}

function fromReply(reply: z.infer<typeof replySchema>, input: AnalysisInput): Analysis {
    const fallback = fallbackAnalysis(input);
    const known = new Set(KNOWN_TAGS);

    // Keep the candidate-specific questions first, then top up from the bank so a short reply still fills a round.
    const seen = new Set<string>();
    const technical: BankQuestion[] = [];
    const add = (question: BankQuestion) => {
        const key = question.question.toLowerCase().slice(0, 60);
        if (!seen.has(key)) { seen.add(key); technical.push(question); }
    };
    for (const t of reply.technicalQuestions) add({ question: t.question, skill: t.skill || "Technical", minLevel: 0, lookFor: t.lookFor, followUps: t.followUps ?? [] });
    for (const t of fallback.technical) add(t);

    const behavioral: BehavioralQuestion[] = [
        ...reply.behavioralQuestions.map((b) => ({ topic: b.topic || "Behavioral", question: b.question, lookFor: b.lookFor?.length ? b.lookFor : ["A specific example", "Their own actions", "The result and what they learned"] })),
        ...fallback.behavioral,
    ];

    const background: BackgroundQuestion[] = [
        ...reply.backgroundQuestions.map((b) => ({ topic: b.topic || "Background", question: b.question, lookFor: b.lookFor?.length ? b.lookFor : ["A clear, specific answer", "Personal contribution"] })),
        ...fallback.background,
    ];

    const keyterms = [...new Set([...reply.keyterms, ...fallback.jd.keyterms].map((t) => t.trim()).filter(Boolean))].slice(0, 60);
    const codingTags = [...new Set(reply.codingTags.map((t) => t.toLowerCase()).filter((t) => known.has(t)))];

    return {
        source: "llm",
        signals: extractSignals({ role: input.role, jobDescription: input.jobDescription, resumeText: input.resumeText, github: input.github, modelTags: codingTags, roleTags: getRoleBank(input.role).codingTags }),
        brief: reply.brief || fallback.brief,
        jd: {
            title: reply.title,
            skills: reply.skills.length > 0 ? reply.skills : fallback.jd.skills,
            keyterms,
            codingTags: codingTags.length > 0 ? codingTags : fallback.jd.codingTags,
            behavioralFocus: reply.behavioralQuestions.map((b) => b.topic || b.question).slice(0, 3),
        },
        technical,
        background,
        behavioral,
        design: reply.design && reply.design.prompt ? { title: reply.design.title || "System design", prompt: reply.design.prompt, lookFor: reply.design.lookFor.length ? reply.design.lookFor : (fallback.design?.lookFor ?? []) } : fallback.design,
    };
}

/**
 * Turns the role, level, job description, resume and GitHub profile into concrete questions. If there
 * is nothing candidate-specific to analyse, or the model fails, the hand-written bank is used, so an
 * interview can always start.
 */
export function analyseCandidate(input: AnalysisInput): Promise<Analysis> {
    const hasContext = Boolean(input.jobDescription?.trim() || input.resumeText?.trim() || input.github?.repos.length);
    if (!hasContext) return Promise.resolve(fallbackAnalysis(input));

    const key = cacheKey(input);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const value = (async () => {
        try {
            const reply = await completeJson(buildMessages(input), replySchema, {
                model: models.evaluation,
                fallbackModels: models.fallbacks,
                maxWaitMs: 45_000,
                reasoning: "low",
                temperature: 0.4,
                maxTokens: 2_600,
            });
            return fromReply(reply, input);
        } catch (error) {
            logger.warn({ err: error }, "Job description analysis failed; using the role question bank");
            cache.delete(key); // a transient failure shouldn't stick
            return fallbackAnalysis(input);
        }
    })();

    cache.set(key, { at: Date.now(), value });
    return value;
}
