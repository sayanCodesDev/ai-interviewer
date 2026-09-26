import type { ChatMessage } from "../llm/client";
import type { ReplyResult } from "./dialogue";
import type { EndReason, ServerEvent } from "./events";
import type { CodingItem, DesignItem, InterviewPlan, PlanRound, TalkItem } from "./plan";
import { getProblemDef, publicView, redactHidden, type ProblemDef, type TestRun } from "./problems";
import { directives, roundNotesBlock, timeLine, type TalkView } from "./prompts";
import { sanitizeUntrusted } from "./untrusted";

export type TurnKind =
    | "opening" | "ask" | "respond" | "present" | "coach" | "review" | "explain" | "followup_ask"
    | "design_ask" | "design_respond" | "nudge" | "force_advance" | "reconnect" | "close";

/** One thing the interviewer is about to say, and everything needed to make the model say it. */
export interface Turn {
    kind: TurnKind;
    /** The CURRENT STEP message shown to the model. */
    directive: string;
    roundKey: string;
    /** Sent to the browser before the interviewer starts speaking (editor opens, round changes). */
    events: ServerEvent[];
    maxTokens: number;
    /** Only these markers are honoured on this turn; the model can't skip steps by emitting others. */
    allowedMarkers: readonly string[];
}

export interface Utterance {
    /** "system" entries are facts about the session (round changes, hints, submissions), never shown to the model as speech. */
    role: "interviewer" | "candidate" | "system";
    text: string;
    roundKey: string;
    at: number;
    interrupted?: boolean;
}

export interface SubmissionSummary {
    problemKey: string;
    language: string;
    code: string;
    run: TestRun;
}

export interface Outcome {
    /** A turn to run straight away, without waiting for the candidate. */
    next: Turn | null;
    /** Events to send now. */
    events: ServerEvent[];
    ended?: EndReason;
}

export interface ConductorOptions {
    plan: InterviewPlan;
    /** The system prompt: persona, candidate context. Built once. */
    systemPrompt: string;
    candidateName?: string;
    now?: () => number;
    onUtterance?: (utterance: Utterance) => void;
    /** A round finished; the transcript is handed over so notes can be written in the background. */
    onRoundComplete?: (round: PlanRound, transcript: Utterance[]) => void;
}

type Step =
    | { t: "talk"; probes: number; brief?: number }
    | {
          t: "coding";
          phase: "present" | "working" | "followup";
          attempt: number;
          hints: number;
          pendingOutcome: "passed" | "retry" | "exhausted" | null;
          followUps: TalkItem[];
          followUpIndex: number;
          probes: number;
          brief?: number;
      }
    | { t: "design"; probes: number; notes: string }
    | { t: "close" };

// Small on purpose: notes carry the earlier parts, and every token is charged against a per-minute allowance.
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 5_000;
/** A call may run this long past its planned length before it is closed regardless. */
const GRACE_MINUTES = 6;
const BRIEF_ANSWER_WORDS = 6;
/** After this many very short answers in a row to one question, stop pressing and move on. */
const MAX_BRIEF_IN_A_ROW = 3;
const HINT_LIMIT = 3;

const speechOnlyTurns = { maxTokens: 200 };

function minutes(ms: number): number {
    return ms / 60_000;
}

function words(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

export class Conductor {
    readonly history: Utterance[] = [];
    private readonly plan: InterviewPlan;
    private readonly now: () => number;
    private readonly notes = new Map<string, string>();
    private readonly startedAt: number;
    private roundStartedAt: number;
    private roundIdx = 0;
    private itemIdx = 0;
    private step: Step = { t: "talk", probes: 0 };
    private ended: EndReason | null = null;
    private closing = false;
    private lastCandidateWords = 0;

    constructor(private readonly options: ConductorOptions) {
        this.plan = options.plan;
        this.now = options.now ?? Date.now;
        this.startedAt = this.now();
        this.roundStartedAt = this.startedAt;
    }

    // ---------------------------------------------------------------------------------- accessors

    private get round(): PlanRound {
        return this.plan.rounds[this.roundIdx]!;
    }

    private get item() {
        return this.round.items[this.itemIdx]!;
    }

    get isEnded(): boolean {
        return this.ended !== null;
    }

    /** The closing words are being (or about to be) said. Nothing the candidate does now changes how the interview ends. */
    get isClosing(): boolean {
        return this.closing;
    }

    /** The coding problem currently open, if any. */
    get currentProblemKey(): string | null {
        return this.step.t === "coding" && !this.closing ? (this.item as CodingItem).problemKey : null;
    }

    /** Whether a system-design notes pad is currently open. */
    get designOpen(): boolean {
        return this.step.t === "design" && !this.closing;
    }

    get elapsedMinutes(): number {
        return minutes(this.now() - this.startedAt);
    }

    get remainingMinutes(): number {
        return Math.max(0, this.plan.totalMinutes - this.elapsedMinutes);
    }

    /** Where the interview is, for logs and the UI. */
    get position() {
        return {
            round: this.round.key,
            roundIndex: this.roundIdx,
            roundTotal: this.plan.rounds.length,
            item: this.item.id,
            step: this.step.t,
            phase: this.step.t === "coding" ? this.step.phase : undefined,
            closing: this.closing,
        };
    }

    private get time(): string {
        return timeLine(this.remainingMinutes);
    }

    private get totalProblems(): number {
        return this.plan.rounds.flatMap((r) => r.items).filter((i) => i.kind === "coding").length;
    }

    private problemNumber(itemId: string): number {
        return this.plan.rounds.flatMap((r) => r.items).filter((i) => i.kind === "coding").findIndex((i) => i.id === itemId) + 1;
    }

    private roundEvent(): ServerEvent {
        return { type: "ROUND", index: this.roundIdx, total: this.plan.rounds.length, key: this.round.key, title: this.round.title, roundType: this.round.type, minutes: this.round.budgetMinutes };
    }

    private turn(kind: TurnKind, directive: string, events: ServerEvent[] = [], allowedMarkers: readonly string[] = [], maxTokens = speechOnlyTurns.maxTokens): Turn {
        return { kind, directive, roundKey: this.round.key, events, allowedMarkers, maxTokens };
    }

    // -------------------------------------------------------------------------------- transcript

    private record(role: Utterance["role"], text: string, interrupted = false): void {
        const cleaned = text.trim();
        if (!cleaned) return;
        const utterance: Utterance = { role, text: cleaned, roundKey: this.round.key, at: this.now(), ...(interrupted ? { interrupted } : {}) };
        this.history.push(utterance);
        this.options.onUtterance?.(utterance);
    }

    private recordSystem(text: string): void {
        this.record("system", text);
    }

    setRoundNotes(roundKey: string, text: string): void {
        this.notes.set(roundKey, text);
    }

    /** Messages for the model: persona and notes, the current part's conversation, then this turn's step. */
    buildMessages(turn: Turn): ChatMessage[] {
        const earlier = this.plan.rounds
            .filter((r) => this.notes.has(r.key))
            .map((r) => ({ title: r.title, text: this.notes.get(r.key)! }));
        const system = [this.options.systemPrompt, roundNotesBlock(earlier)].filter(Boolean).join("\n\n");

        // The current round in full, plus a little of the one before so a transition has context.
        const currentRound = this.history.filter((u) => u.roundKey === this.round.key);
        const previous = this.history.filter((u) => u.roundKey !== this.round.key && u.role !== "system").slice(-2);
        const window = [...previous, ...currentRound];

        const messages: ChatMessage[] = [];
        let chars = 0;
        const spoken = window.filter((u) => u.role !== "system");
        for (let i = spoken.length - 1; i >= 0 && messages.length < MAX_HISTORY_MESSAGES; i--) {
            const u = spoken[i]!;
            chars += u.text.length;
            if (chars > MAX_HISTORY_CHARS) break;
            messages.unshift({ role: u.role === "interviewer" ? "assistant" : "user", content: u.role === "candidate" ? sanitizeUntrusted(u.text, 1_500) : u.text });
        }

        if (!messages.some((m) => m.role === "user")) messages.push({ role: "user", content: "[The candidate has just joined the call.]" });
        return [{ role: "system", content: system }, ...messages, { role: "system", content: turn.directive }];
    }

    // ----------------------------------------------------------------------------------- starting

    /** The interviewer speaks first. */
    begin(): Turn {
        const item = this.item as TalkItem;
        this.step = { t: "talk", probes: 0 };
        this.recordSystem(`Part 1 of ${this.plan.rounds.length}: ${this.round.title}`);
        return this.turn("opening", directives.opening({ prompt: item.prompt, candidateName: this.options.candidateName, time: this.time }), [this.roundEvent()]);
    }

    // ------------------------------------------------------------------------ candidate activity

    /** The candidate said something (spoken or typed). */
    onCandidate(text: string): Turn | null {
        if (this.ended || this.closing) return null;
        this.record("candidate", text);
        this.lastCandidateWords = words(text);
        const step = this.step;

        switch (step.t) {
            case "talk":
                if (this.round.type === "wrapup") {
                    return this.turn("respond", directives.candidateQuestions({ probesUsed: step.probes, maxProbes: (this.item as TalkItem).maxProbes, time: this.time }), [], ["ADVANCE"]);
                }
                return this.turn("respond", directives.respond(this.talkView(this.item as TalkItem, step.probes), ...this.briefness(step)), [], ["ADVANCE"]);

            case "coding": {
                if (step.phase === "followup") {
                    const followUp = step.followUps[step.followUpIndex]!;
                    return this.turn("respond", directives.respond(this.followUpView(followUp, step), ...this.briefness(step)), [], ["ADVANCE"]);
                }
                const def = this.problem();
                return this.turn("coach", directives.coach({
                    title: def.title,
                    statement: def.statement,
                    constraints: def.constraints,
                    approach: def.solution.approach,
                    attempt: Math.min(step.attempt + 1, this.plan.maxCodingAttempts),
                    maxAttempts: this.plan.maxCodingAttempts,
                    hintsGiven: step.hints,
                    nextHint: step.hints < HINT_LIMIT ? def.hints[step.hints]! : null,
                    time: this.time,
                }), [], ["HINT", "MOVE_ON"]);
            }

            case "design": {
                const d = this.item as DesignItem;
                return this.turn("design_respond", directives.designRespond({ ...d, probesUsed: step.probes, notes: step.notes || undefined, time: this.time }), [], ["ADVANCE"]);
            }

            default:
                return null;
        }
    }

    /** The candidate submitted a coding solution; `run` has already been graded by the sandbox. */
    onSubmission(sub: SubmissionSummary): Turn | null {
        const step = this.step;
        if (this.ended || this.closing || step.t !== "coding" || (this.item as CodingItem).problemKey !== sub.problemKey) return null;
        // Once the problem is solved and the follow-up questions have begun, further submissions are recorded but not reviewed.
        if (step.phase === "followup") return null;

        step.attempt += 1;
        step.phase = "working";
        const passed = sub.run.status === "PASSED" && sub.run.passed === sub.run.total;
        const outcome = passed ? "passed" : step.attempt >= this.plan.maxCodingAttempts ? "exhausted" : "retry";
        step.pendingOutcome = outcome;

        const def = this.problem();
        this.recordSystem(`Candidate submitted ${sub.language} code for "${def.title}" (attempt ${step.attempt}): ${summariseRun(sub.run)}`);
        return this.turn("review", directives.review({
            title: def.title,
            language: sub.language,
            attempt: step.attempt,
            maxAttempts: this.plan.maxCodingAttempts,
            summary: summariseRun(sub.run),
            code: sub.code.slice(0, 6_000),
            outcome,
            time: this.time,
        }), [], [], 260);
    }

    /** The candidate shared their design notes. */
    onNotes(text: string): Turn | null {
        const step = this.step;
        if (this.ended || this.closing || step.t !== "design") return null;
        step.notes = sanitizeUntrusted(text, 3_000);
        this.record("candidate", `[Shared design notes: ${step.notes.slice(0, 1_500)}]`);
        const d = this.item as DesignItem;
        return this.turn("design_respond", directives.designRespond({ ...d, probesUsed: step.probes, notes: step.notes, time: this.time }), [], ["ADVANCE"]);
    }

    // ----------------------------------------------------------------------------------- silence

    /** How long to wait before each nudge, given what the candidate is doing. Null means never. */
    silencePolicy(): { nudgeMs: [number, number]; autoAdvanceMs: number | null } | null {
        if (this.ended || this.closing) return null;
        if (this.step.t === "coding" && this.step.phase !== "followup") return { nudgeMs: [120_000, 300_000], autoAdvanceMs: null };
        return { nudgeMs: [22_000, 50_000], autoAdvanceMs: 85_000 };
    }

    onSilence(level: 1 | 2 | 3): Turn | null {
        if (this.ended || this.closing) return null;
        const step = this.step;
        const coding = step.t === "coding" && step.phase !== "followup";

        if (level === 3) {
            if (coding) return null;
            return this.turn("force_advance", directives.forceAdvance({ time: this.time }), [], ["ADVANCE"]);
        }
        const context = coding
            ? level === 1 ? "They are writing code. Ask how it is going and whether they would like to talk through their approach." : "They may be stuck. Offer a hint if they would like one."
            : level === 1 ? "You are waiting for their answer to your last question." : "You are still waiting for their answer to your last question.";
        return this.turn("nudge", directives.nudge({ level: level as 1 | 2, context, time: this.time }));
    }

    /** The call dropped and came back. */
    onReconnect(): Turn | null {
        if (this.ended || this.closing) return null;
        const step = this.step;
        let where = "";
        if (step.t === "coding" && step.phase !== "followup") where = "remind them the problem is still open in the editor and invite them to continue.";
        else if (step.t === "coding") where = `briefly repeat your last question: "${step.followUps[step.followUpIndex]?.prompt ?? ""}"`;
        else if (step.t === "design") where = "invite them to continue their design.";
        else where = `briefly repeat your last question: "${(this.item as TalkItem).prompt}"`;
        return this.turn("reconnect", directives.reconnect({ where, time: this.time }));
    }

    /** Called periodically. Returns a turn when time has run out. */
    onTick(): Turn | null {
        if (this.ended || this.closing) return null;
        if (this.elapsedMinutes >= this.plan.totalMinutes + GRACE_MINUTES) return this.beginClosing("Time is up; wrap up right now.");
        return null;
    }

    // ----------------------------------------------------------------------------- after a reply

    /** Applies what the interviewer just said: interpret markers, move the interview along. */
    finishTurn(turn: Turn, reply: ReplyResult): Outcome {
        const none: Outcome = { next: null, events: [] };
        this.record("interviewer", reply.text, reply.interrupted);
        // The closing is always the last thing said, whether or not the model remembered its marker, and it ends the
        // interview even if the candidate spoke over it. Everything else about the conversation is frozen once the
        // closing starts, so "no result" here would leave the call open forever.
        if (turn.kind === "close") {
            this.ended = "completed";
            return { next: null, events: [], ended: "completed" };
        }
        if (reply.interrupted) return none;

        const markers = reply.markers.filter((m) => turn.allowedMarkers.includes(m));
        const step = this.step;

        switch (turn.kind) {
            case "opening":
            case "ask":
            case "followup_ask":
            case "design_ask":
            case "present":
                if (turn.kind === "present" && step.t === "coding") step.phase = "working";
                return none;

            case "respond": {
                if (step.t === "talk") {
                    const done = markers.includes("ADVANCE") || step.probes >= (this.item as TalkItem).maxProbes || (step.brief ?? 0) >= MAX_BRIEF_IN_A_ROW;
                    if (done) return this.advance(true);
                    if (this.lastCandidateWords >= BRIEF_ANSWER_WORDS) step.probes++;
                    return none;
                }
                if (step.t === "coding" && step.phase === "followup") {
                    const followUp = step.followUps[step.followUpIndex]!;
                    const done = markers.includes("ADVANCE") || step.probes >= followUp.maxProbes || (step.brief ?? 0) >= MAX_BRIEF_IN_A_ROW;
                    if (!done) {
                        if (this.lastCandidateWords >= BRIEF_ANSWER_WORDS) step.probes++;
                        return none;
                    }
                    return this.nextFollowUpOrAdvance(step);
                }
                return none;
            }

            case "design_respond": {
                if (step.t !== "design") return none;
                const done = markers.includes("ADVANCE") || step.probes >= (this.item as DesignItem).maxProbes;
                if (done) return this.advance(true);
                step.probes++;
                return none;
            }

            case "coach": {
                if (step.t !== "coding") return none;
                if (markers.includes("HINT") && step.hints < HINT_LIMIT) {
                    step.hints++;
                    this.recordSystem(`Hint ${step.hints} of ${HINT_LIMIT} given for "${this.problem().title}"`);
                }
                if (markers.includes("MOVE_ON")) {
                    const def = this.problem();
                    this.recordSystem(`Candidate chose to move on from "${def.title}" without a passing solution`);
                    return { next: this.turn("explain", directives.explain({ title: def.title, approach: def.solution.approach, time: this.time }), [], [], 260), events: [] };
                }
                return none;
            }

            case "review": {
                if (step.t !== "coding") return none;
                if (step.pendingOutcome === "retry") return none;
                if (step.pendingOutcome === "passed" && this.plan.codingFollowUps > 0) return this.beginFollowUps(step);
                return this.advance(false);
            }

            case "explain":
                return this.advance(false);

            case "force_advance":
                return this.advance(false);

            default:
                return none;
        }
    }

    // ---------------------------------------------------------------------------------- movement

    private beginFollowUps(step: Extract<Step, { t: "coding" }>): Outcome {
        const def = this.problem();
        const all: TalkItem[] = [
            { kind: "talk", id: `${this.item.id}:fu0`, topic: "Complexity", prompt: "What is the time and space complexity of your solution, and why?", lookFor: [`Time: ${def.solution.time}`, `Space: ${def.solution.space}`, "Correct reasoning, not just the final notation"], followUps: [], maxProbes: 1 },
            { kind: "talk", id: `${this.item.id}:fu1`, topic: "Optimisation", prompt: "Is there a better approach, or a different approach with different trade-offs?", lookFor: [def.solution.approach, "Understands the trade-off between time and memory"], followUps: [], maxProbes: 1 },
        ];
        step.followUps = all.slice(0, this.plan.codingFollowUps);
        step.followUpIndex = -1;
        step.phase = "followup";
        return this.nextFollowUpOrAdvance(step);
    }

    private nextFollowUpOrAdvance(step: Extract<Step, { t: "coding" }>): Outcome {
        step.followUpIndex += 1;
        step.probes = 0;
        step.brief = 0;
        const next = step.followUps[step.followUpIndex];
        if (!next) return this.advance(true);
        const def = this.problem();
        return {
            next: this.turn("followup_ask", directives.followUpAsk({ title: def.title, question: next.prompt, time: this.time })),
            events: [],
        };
    }

    /** Should we skip ahead because time is short or a part has overrun? */
    private shouldSkipRound(): boolean {
        const round = this.round;
        if (round.type === "wrapup") return false;
        const wrapBudget = this.plan.rounds.filter((r) => r.type === "wrapup").reduce((sum, r) => sum + r.budgetMinutes, 0);
        return this.remainingMinutes <= wrapBudget + 1.5;
    }

    private roundOverran(): boolean {
        const spent = minutes(this.now() - this.roundStartedAt);
        const limit = this.round.type === "coding" ? 1.3 : 1.4;
        return spent > this.round.budgetMinutes * limit;
    }

    /** Moves to the next item (or round), closing the editor if it was open. */
    private advance(justAcknowledged: boolean): Outcome {
        const events: ServerEvent[] = [];
        if (this.step.t === "coding" || this.step.t === "design") events.push({ type: "HIDE_CODE_EDITOR" });

        this.itemIdx += 1;
        let roundChanged = false;

        if (this.itemIdx >= this.round.items.length || (this.roundOverran() && this.round.type !== "wrapup")) {
            this.completeRound();
            this.roundIdx += 1;
            this.itemIdx = 0;
            this.roundStartedAt = this.now();
            roundChanged = true;
        }

        // Out of time for the remaining parts: go straight to the wrap-up.
        if (this.roundIdx < this.plan.rounds.length && this.shouldSkipRound()) {
            const wrapIdx = this.plan.rounds.findIndex((r, i) => i >= this.roundIdx && r.type === "wrapup");
            if (wrapIdx > this.roundIdx || (wrapIdx === this.roundIdx && this.itemIdx > 0)) {
                if (!roundChanged) this.completeRound();
                this.roundIdx = wrapIdx;
                this.itemIdx = 0;
                this.roundStartedAt = this.now();
                roundChanged = true;
            }
        }

        if (this.roundIdx >= this.plan.rounds.length) {
            this.ended = "completed";
            return { next: null, events, ended: "completed" };
        }
        return { next: this.startItem(roundChanged, justAcknowledged), events };
    }

    private completeRound(): void {
        const key = this.round.key;
        this.options.onRoundComplete?.(this.round, this.history.filter((u) => u.roundKey === key));
    }

    private startItem(roundChanged: boolean, justAcknowledged: boolean): Turn {
        const round = this.round;
        const item = this.item;
        const first = this.itemIdx === 0;
        const events: ServerEvent[] = roundChanged ? [this.roundEvent()] : [];
        if (roundChanged) this.recordSystem(`Part ${this.roundIdx + 1} of ${this.plan.rounds.length}: ${round.title}`);

        if (item.kind === "coding") {
            const def = getProblemDef(item.problemKey)!;
            this.step = { t: "coding", phase: "present", attempt: 0, hints: 0, pendingOutcome: null, followUps: [], followUpIndex: -1, probes: 0 };
            const number = this.problemNumber(item.id);
            this.recordSystem(`Coding problem ${number} of ${this.totalProblems}: "${def.title}"`);
            events.push({
                type: "SHOW_CODE_EDITOR",
                mode: "code",
                problemNumber: number,
                problemTotal: this.totalProblems,
                problem: publicView(def),
                title: def.title,
                question: def.statement,
                language: "javascript",
            });
            return this.turn("present", directives.presentProblem({ number, total: this.totalProblems, title: def.title, difficulty: def.difficulty, statement: def.statement, firstProblem: number === 1, time: this.time }), events, [], 260);
        }

        if (item.kind === "design") {
            this.step = { t: "design", probes: 0, notes: "" };
            events.push({ type: "SHOW_CODE_EDITOR", mode: "notes", problemNumber: 1, problemTotal: 1, title: item.title, question: item.prompt, language: "markdown" });
            return this.turn("design_ask", directives.designAsk({ title: item.title, prompt: item.prompt, lookFor: item.lookFor, firstInRound: first, time: this.time }), events);
        }

        // A talk item. The last item of the wrap-up is the closing.
        if (round.type === "wrapup" && this.itemIdx === round.items.length - 1) return this.beginClosing(item.prompt, events);

        this.step = { t: "talk", probes: 0 };
        return this.turn("ask", directives.ask(this.talkView(item, 0, first), justAcknowledged), events);
    }

    private beginClosing(prompt: string, events: ServerEvent[] = []): Turn {
        this.closing = true;
        const hideEditor: ServerEvent[] = this.step.t === "coding" || this.step.t === "design" ? [{ type: "HIDE_CODE_EDITOR" }] : [];
        this.step = { t: "close" };
        return this.turn("close", directives.close({ prompt, time: this.time }), [...hideEditor, ...events], ["END"], 220);
    }

    // ------------------------------------------------------------------------------------ views

    private problem(): ProblemDef {
        return getProblemDef((this.item as CodingItem).problemKey)!;
    }

    /**
     * Whether the answer just given was very short, and whether this is the last time the interviewer may
     * press for more. Counts short answers in a row for the current question; a proper answer resets it.
     */
    private briefness(step: { brief?: number }): [brief: boolean, moveOn: boolean] {
        const brief = this.lastCandidateWords < BRIEF_ANSWER_WORDS;
        step.brief = brief ? (step.brief ?? 0) + 1 : 0;
        return [brief, step.brief >= MAX_BRIEF_IN_A_ROW];
    }

    private talkView(item: TalkItem, probesUsed: number, firstInRound = false): TalkView {
        const talkItems = this.round.items.filter((i) => i.kind === "talk");
        return {
            roundTitle: this.round.title,
            number: talkItems.findIndex((i) => i.id === item.id) + 1,
            total: talkItems.length,
            topic: item.topic,
            prompt: item.prompt,
            lookFor: item.lookFor,
            followUps: item.followUps,
            probesUsed,
            maxProbes: item.maxProbes,
            firstInRound,
            time: this.time,
        };
    }

    private followUpView(item: TalkItem, step: Extract<Step, { t: "coding" }>): TalkView {
        return {
            roundTitle: "Coding follow-up",
            number: step.followUpIndex + 1,
            total: step.followUps.length,
            topic: item.topic,
            prompt: item.prompt,
            lookFor: item.lookFor,
            followUps: [],
            probesUsed: step.probes,
            maxProbes: item.maxProbes,
            firstInRound: false,
            time: this.time,
        };
    }
}

/** A plain-language account of a test run, for the model and the transcript. Hidden data never appears. */
export function summariseRun(run: TestRun): string {
    if (run.status === "COMPILE_ERROR") return `it did not compile: ${(run.compileOutput ?? "").split("\n")[0]?.slice(0, 200)}`;
    if (run.status === "ERROR") return "the tests could not be run (a system problem, not the candidate's fault)";
    if (run.status === "RUNTIME_ERROR" && run.passed === 0 && run.cases.every((c) => c.status !== "pass" && c.status !== "fail")) {
        return `it crashed before any test finished: ${(run.stderr ?? run.cases.find((c) => c.error)?.error ?? "unknown error").split("\n").slice(-1)[0]?.slice(0, 200)}`;
    }

    const head = `${run.passed} of ${run.total} tests passed`;
    if (run.passed === run.total) return `${head}.`;

    const failing = run.cases.filter((c) => c.status !== "pass" && c.status !== "ran");
    const labels = failing.slice(0, 4).map((c) => `${c.label ?? c.id} (${c.status === "timeout" ? "too slow" : c.status === "error" ? "runtime error" : c.status === "skipped" ? "not reached" : "wrong answer"})`);
    return `${head}. Failing: ${labels.join("; ")}${failing.length > 4 ? `; and ${failing.length - 4} more` : ""}.`;
}

export { redactHidden };
