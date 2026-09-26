import { z } from "zod";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { clientConcealedPercent, clientLossPercent, codeRuns, firstAudioMs, firstSentenceMs, interviewsFinished, llmErrors, weakConnectionWindows } from "../observability/metrics";
import { getLlm, models, RateLimitedError } from "../llm/client";
import { Conductor, type Turn } from "../interview/conductor";
import { streamReply, type ReplyResult } from "../interview/dialogue";
import { clientMessageSchema, type EndReason, type ServerEvent } from "../interview/events";
import { maxCallMinutes, type Format, type InterviewPlan } from "../interview/plan";
import { getProblemDef, publicView, redactHidden, runAll } from "../interview/problems";
import { personaPrompt } from "../interview/prompts";
import { InterviewRecorder } from "../interview/recorder";
import { VOICES, finishInterview, markStarted } from "../interview/service";
import { EchoGuard } from "../voice/echoGuard";
import { isInterruption } from "../voice/turnTaker";
import { removeLive } from "./registry";
import { Voice, type VoiceFactory, type VoiceLike } from "./voice";

let defaultVoiceFactory: VoiceFactory = Voice.open;

/** Tests swap in a fake audio stack for calls the HTTP route creates. Pass null to restore the real one. */
export function setVoiceFactoryForTesting(factory: VoiceFactory | null): void {
    defaultVoiceFactory = factory ?? Voice.open;
}

/** How long a dropped call is held open for the candidate to come back before the interview is closed. */
const RECONNECT_WINDOW_MS = 90_000;
const TICK_MS = 10_000;
const CLOSING_AUDIO_GRACE_MS = 900;
/** Words of unfinished speech that confirm the candidate is really interrupting (fewer only dips the interviewer's voice). */
const BARGE_IN_WORDS = 3;
/** How long the interviewer stays dipped when nothing more is heard. */
const DUCK_HOLD_MS = 1_200;
/** The data channel bypasses the HTTP rate limiters, so it has its own: a candidate can't spam the sandbox or the model. */
const MAX_MESSAGES_PER_10S = 24;
const MAX_SUBMISSIONS_PER_PROBLEM = 12;
const MIN_SUBMISSION_GAP_MS = 3_000;

export interface LiveInterviewInit {
    interview: {
        id: string;
        userId: string;
        targetRole: string;
        level: string;
        format: string;
        voice: string;
        accent: string;
        jobDescription: string | null;
        resumeText: string | null;
    };
    plan: InterviewPlan;
    candidateName?: string;
    /** Replaces the real audio stack in tests. */
    voiceFactory?: VoiceFactory;
    /** How long a dropped call is held open. Shortened in tests. */
    reconnectWindowMs?: number;
    /** Called after the interview is closed and saved, so the caller can start scoring. */
    onFinished?: (interviewId: string, info: { substantive: boolean; reason: EndReason }) => void;
}

/** The part of a reply the candidate had probably heard when they cut in. */
export function approximateSpoken(sentences: string[], playedFraction: number): string {
    if (sentences.length === 0 || playedFraction <= 0.03) return "";
    const total = sentences.reduce((sum, s) => sum + s.length, 0);
    const target = total * playedFraction;
    let sum = 0;
    const heard: string[] = [];
    for (const sentence of sentences) {
        heard.push(sentence);
        sum += sentence.length;
        if (sum >= target) break;
    }
    return heard.join(" ");
}

/**
 * One interview, from the first greeting to the closing words. It owns the conversation (the
 * conductor and transcript recorder) and lends itself to a series of phone-call connections: if the
 * browser drops and reconnects within a minute and a half, the same interview carries on.
 */
export class LiveInterview {
    private readonly conductor: Conductor;
    private readonly recorder: InterviewRecorder;
    private readonly startedAt = Date.now();
    private voice: VoiceLike | null = null;

    private chain: Promise<void> = Promise.resolve();
    private abort: AbortController | null = null;
    private replyActive = false;
    private finalized = false;
    private reconnects = 0;
    /** Whether the interviewer has already said hello. A later connection resumes instead of starting over. */
    private begun = false;
    private captionSeq = 0;
    private candidateCaptionId = "c0";
    private lastInterimCaptionAt = 0;
    private readonly attempts = new Map<string, number>();
    private messageTimes: number[] = [];
    private lastSubmissionAt = 0;
    private lastWeakLogAt = 0;
    private duckTimer: NodeJS.Timeout | undefined;
    private silenceTimers: NodeJS.Timeout[] = [];
    /** Recognises the interviewer's own voice leaking back through the candidate's microphone. */
    private readonly echo = new EchoGuard();
    private suspendTimer: NodeJS.Timeout | null = null;
    private readonly tickTimer: NodeJS.Timeout;

    constructor(private readonly init: LiveInterviewInit) {
        const { interview, plan } = init;
        const voiceInfo = VOICES.find((v) => v.id === interview.voice);

        this.recorder = new InterviewRecorder(interview.id, this.startedAt);
        this.conductor = new Conductor({
            plan,
            candidateName: init.candidateName,
            systemPrompt: personaPrompt({
                interviewerName: voiceInfo?.name ?? "Thalia",
                role: interview.targetRole,
                level: interview.level as never,
                candidateName: init.candidateName,
                brief: plan.brief,
            }),
            onUtterance: (utterance) => this.recorder.addTurn(utterance),
            onRoundComplete: (round, transcript) => void this.summariseRound(round.key, round.title, transcript),
        });

        this.tickTimer = setInterval(() => this.tick(), TICK_MS);
        this.tickTimer.unref();
    }

    get id(): string {
        return this.init.interview.id;
    }

    get isFinalized(): boolean {
        return this.finalized;
    }

    /** Resolves when every queued interviewer turn has finished. Used by tests and by shutdown. */
    async idle(): Promise<void> {
        await this.chain;
    }

    // ------------------------------------------------------------------------------- connecting

    /** Opens a call for this interview. The first connection starts the interview; later ones resume it. */
    async connect(offer: { sdp: string; type: "offer" }): Promise<{ sdp: string; type: string }> {
        const previous = this.voice;
        const resuming = this.begun;

        const open: VoiceFactory = this.init.voiceFactory ?? defaultVoiceFactory;
        let current: VoiceLike | null = null;
        const { voice, answer } = await open(
            offer,
            { accent: this.init.interview.accent, voice: this.init.interview.voice, keyterms: this.init.plan.keyterms },
            {
                onCandidateTurn: (text) => this.onSpokenTurn(text),
                onCandidateSpeaking: (text, isFinal) => this.onCandidateSpeaking(text, isFinal),
                onClientMessage: (data) => this.onClientMessage(data),
                onChannelOpen: () => current && this.onChannelOpen(current, resuming),
                onClosed: (reason) => current && this.onVoiceClosed(current, reason),
                onNotice: (message) => this.sendNotice("info", message),
            },
        );
        current = voice;
        // The interview officially starts when the first call connects. Awaited so a report or a page refresh never sees "created".
        if (!resuming) await markStarted(this.id);

        // A new connection replaces the old one. Detach the old first so its close doesn't start the reconnect timer.
        if (previous) {
            this.voice = null;
            previous.close("replaced by a new connection");
        }
        this.voice = voice;
        this.reconnects += resuming ? 1 : 0;
        if (this.suspendTimer) clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
        return answer;
    }

    private onChannelOpen(voice: VoiceLike, resuming: boolean): void {
        if (voice !== this.voice || this.finalized) return;
        // A reconnecting browser has lost the editor; put it back.
        const restore = this.conductor.currentProblemKey ? this.editorEvents() : [];
        for (const event of restore) this.send(event);

        this.abortReply();
        const opening = resuming ? this.conductor.onReconnect() : this.conductor.begin();
        this.begun = true;
        this.enqueue(() => this.perform(opening));
    }

    /** The events that show the current coding problem, for a browser that just (re)connected. */
    private editorEvents(): ServerEvent[] {
        const key = this.conductor.currentProblemKey;
        const def = key ? getProblemDef(key) : undefined;
        if (!def) return [];
        const problems = this.init.plan.rounds.flatMap((r) => r.items).filter((i) => i.kind === "coding");
        const number = problems.findIndex((i) => i.kind === "coding" && i.problemKey === key) + 1;
        return [{
            type: "SHOW_CODE_EDITOR", mode: "code", problemNumber: number, problemTotal: problems.length,
            problem: publicView(def),
            title: def.title, question: def.statement, language: "javascript",
        }];
    }

    // ------------------------------------------------------------------------------ candidate input

    private onCandidateSpeaking(text: string, isFinal: boolean): void {
        // The interviewer's own voice coming back through the speakers is not the candidate: don't caption it,
        // and don't stop talking because of it.
        if (config.voiceEchoGuard && this.echo.isEcho(text, 2)) return;

        this.clearSilenceTimers();
        // Cut the interviewer off only for real speech, not "mm-hmm" or a stray sound. And not on the first word or two:
        // that is exactly what a stray noise or a trace of echo looks like. Until it is clear the candidate really is
        // talking (a few words, or a finished utterance) the interviewer only dips their voice, which recovers by itself.
        if ((this.replyActive || (this.voice?.queuedMs ?? 0) > 250) && isInterruption(text) && !this.conductor.isClosing) {
            if (isFinal || text.trim().split(/\s+/).length >= BARGE_IN_WORDS) this.abortReply();
            else this.dipVoice();
        }

        const now = Date.now();
        if (isFinal || now - this.lastInterimCaptionAt > 200) {
            this.lastInterimCaptionAt = now;
            this.send({ type: "CAPTION", id: this.candidateCaptionId, role: "candidate", text, final: false });
        }
    }

    /** A finished utterance from speech recognition. Typed answers skip the echo check and go straight to onCandidateTurn. */
    private onSpokenTurn(text: string): void {
        if (config.voiceEchoGuard && this.echo.isEcho(text)) {
            logger.debug({ interviewId: this.id, text: text.slice(0, 80) }, "Ignored the interviewer's own voice heard through the microphone");
            return;
        }
        this.onCandidateTurn(text);
    }

    private onCandidateTurn(text: string): void {
        // Let the goodbye finish: the interview is over either way, and the candidate should hear what happens next.
        if (!this.conductor.isClosing) this.abortReply();
        this.send({ type: "CAPTION", id: this.candidateCaptionId, role: "candidate", text, final: true });
        this.candidateCaptionId = `c${++this.captionSeq}`;
        this.enqueue(async () => {
            await this.perform(this.conductor.onCandidate(text));
        });
    }

    /** Sliding-window limit on everything the browser sends over the data channel. */
    private allowMessage(): boolean {
        const now = Date.now();
        this.messageTimes = this.messageTimes.filter((t) => now - t < 10_000);
        if (this.messageTimes.length >= MAX_MESSAGES_PER_10S) return false;
        this.messageTimes.push(now);
        return true;
    }

    private onClientMessage(raw: string): void {
        if (raw.length > 200_000) return;
        if (!this.allowMessage()) {
            this.sendNotice("warning", "You're sending messages too quickly. Slow down a little.");
            return;
        }
        let message;
        try {
            message = clientMessageSchema.parse(JSON.parse(raw));
        } catch (error) {
            if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError)) throw error;
            logger.warn({ interviewId: this.id }, "Ignored an invalid data-channel message");
            return;
        }

        switch (message.type) {
            case "USER_TEXT":
                this.onCandidateTurn(message.text);
                break;
            case "SUBMIT_CODE":
                this.abortReply();
                this.enqueue(() => this.handleSubmission(message.problemKey, message.language, message.code));
                break;
            case "SUBMIT_NOTES":
                this.abortReply();
                this.enqueue(async () => {
                    await this.perform(this.conductor.onNotes(message.text));
                });
                break;
            case "END_INTERVIEW":
                void this.finalize("candidate_ended");
                break;
            case "CLIENT_STATS":
                this.noteClientStats(message);
                break;
            case "PING":
                break;
        }
    }

    /** The browser reports how the interviewer's voice is arriving. Counted, and a bad stretch is logged so it can be investigated. */
    private noteClientStats(stats: { lossPercent: number; concealedPercent: number; jitterMs: number; packets: number }): void {
        clientLossPercent.observe(stats.lossPercent);
        clientConcealedPercent.observe(stats.concealedPercent);
        if (stats.lossPercent < 5 && stats.concealedPercent < 8) return;
        weakConnectionWindows.inc();
        const now = Date.now();
        if (now - this.lastWeakLogAt < 60_000) return;
        this.lastWeakLogAt = now;
        logger.warn({ interviewId: this.id, ...stats }, "The candidate's voice connection is weak: the browser is hiding gaps in the interviewer's voice");
    }

    private async handleSubmission(problemKey: string, language: string, code: string): Promise<void> {
        const activeKey = this.conductor.currentProblemKey;
        const def = getProblemDef(problemKey);
        if (!def || activeKey !== problemKey) {
            this.sendNotice("warning", "That problem isn't open right now.");
            return;
        }

        const now = Date.now();
        if ((this.attempts.get(problemKey) ?? 0) >= MAX_SUBMISSIONS_PER_PROBLEM) {
            this.sendNotice("warning", "You've reached the submission limit for this problem.");
            return;
        }
        if (now - this.lastSubmissionAt < MIN_SUBMISSION_GAP_MS) {
            this.sendNotice("info", "Give the last submission a moment to finish before sending another.");
            return;
        }
        this.lastSubmissionAt = now;

        this.send({ type: "STATE", state: "thinking" });
        let run;
        try {
            run = await runAll(def, language as never, code);
        } catch (error) {
            logger.error({ err: error, interviewId: this.id, problemKey }, "Grading a submission failed");
            this.sendNotice("warning", "We couldn't run your tests just now. Try submitting again.");
            this.send({ type: "STATE", state: "listening" });
            return;
        }
        const attempt = (this.attempts.get(problemKey) ?? 0) + 1;

        if (run.status === "ERROR") {
            codeRuns.inc({ outcome: "system_error" });
            this.sendNotice("warning", run.message ?? "We couldn't run your tests just now. Try submitting again.");
            this.send({ type: "STATE", state: "listening" });
            return;
        }
        this.attempts.set(problemKey, attempt);
        codeRuns.inc({ outcome: run.status.toLowerCase() });

        this.send({ type: "SUBMISSION_RESULT", problemKey, attempt, run: redactHidden(run) });
        // Save while the interviewer reviews; the turn isn't over until both are done.
        const saved = this.recorder.addSubmission({ problemKey, kind: "SUBMIT", attempt, language, code, run });
        await this.perform(this.conductor.onSubmission({ problemKey, language, code, run }));
        await saved;
    }

    // ------------------------------------------------------------------------------ speaking turns

    /** Runs interviewer turns one after another, so two replies never talk over each other. */
    private enqueue(job: () => Promise<void>): void {
        this.chain = this.chain.then(job).catch((error) => logger.error({ err: error, interviewId: this.id }, "Interview turn failed"));
    }

    /** The candidate might be interrupting: turn the interviewer down for a moment while it becomes clear. */
    private dipVoice(): void {
        this.voice?.duck?.(true);
        clearTimeout(this.duckTimer);
        this.duckTimer = setTimeout(() => this.voice?.duck?.(false), DUCK_HOLD_MS);
        this.duckTimer.unref();
    }

    private undip(): void {
        clearTimeout(this.duckTimer);
        this.voice?.duck?.(false);
    }

    private abortReply(): void {
        this.undip();
        if (this.replyActive) this.abort?.abort();
        if ((this.voice?.queuedMs ?? 0) > 0 || this.replyActive) this.voice?.stopSpeech();
    }

    private async perform(first: Turn | null): Promise<void> {
        let turn = first;
        for (let guard = 0; turn && guard < 8 && !this.finalized && this.voice; guard++) {
            const outcome = await this.speak(turn);
            for (const event of outcome.events) this.send(event);
            if (outcome.ended) {
                void this.finalize(outcome.ended);
                return;
            }
            turn = outcome.next;
        }
        this.watchSilence();
    }

    private async speak(turn: Turn) {
        const voice = this.voice!;
        this.clearSilenceTimers();
        for (const event of turn.events) this.send(event);
        this.send({ type: "STATE", state: "thinking" });

        const controller = new AbortController();
        this.abort = controller;
        this.replyActive = true;
        const startedAt = Date.now();
        const captionId = `i${++this.captionSeq}`;
        const sentences: string[] = [];

        await voice.beginSpeech();
        voice.onFirstAudio(() => firstAudioMs.observe(Date.now() - startedAt));

        let result: ReplyResult;
        try {
            result = await streamReply(getLlm(), this.conductor.buildMessages(turn), {
                model: models.dialogue,
                fallbackModels: models.fallbacks,
                // Fail over to another model at once, but if every model is throttled a pause of a few seconds
                // (the room shows "thinking") is kinder than a "technical hiccup" and asking the candidate to repeat.
                maxWaitMs: 10_000,
                maxTokens: turn.maxTokens,
                temperature: 0.6,
                reasoning: "none",
                signal: controller.signal,
                onSentence: (sentence) => {
                    if (sentences.length === 0) this.send({ type: "STATE", state: "speaking" });
                    sentences.push(sentence);
                    this.echo.noteSpoken(sentence);
                    voice.speak(sentence);
                    this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: sentences.join(" "), final: false });
                },
            });
            if (result.firstSentenceMs !== null) firstSentenceMs.observe(result.firstSentenceMs);
        } catch (error) {
            llmErrors.inc({ stage: "dialogue" });
            logger.error({ err: error, interviewId: this.id, kind: turn.kind }, "The interviewer's model call failed");
            const apology = error instanceof RateLimitedError
                ? "Sorry, I'm a bit overloaded right now. Give me a moment, then say that again."
                : "Sorry, I had a technical hiccup. Could you say that again?";
            sentences.push(apology);
            this.echo.noteSpoken(apology);
            voice.speak(apology);
            this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: apology, final: false });
            // A failed reply must not move the interview on, so report it as cut off.
            result = { text: apology, markers: [], interrupted: true, firstSentenceMs: null };
        }

        voice.endSpeech();
        this.replyActive = false;

        if (result.interrupted && sentences.length > 0 && result.text !== sentences[sentences.length - 1]) {
            result = { ...result, text: approximateSpoken(sentences, voice.playedFraction()) };
        }
        this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: result.text || sentences.join(" "), final: true });
        return this.conductor.finishTurn(turn, result);
    }

    // ---------------------------------------------------------------------------------- silence

    private clearSilenceTimers(): void {
        for (const timer of this.silenceTimers) clearTimeout(timer);
        this.silenceTimers = [];
    }

    /** Once the interviewer has stopped speaking, start the clock on how long the candidate stays quiet. */
    private watchSilence(): void {
        this.clearSilenceTimers();
        const policy = this.conductor.silencePolicy();
        const voice = this.voice;
        if (!policy || !voice) return;

        void voice.drained().then(() => {
            if (this.finalized || voice !== this.voice || voice.isClosed) return;
            this.send({ type: "STATE", state: "listening" });
            const levels: Array<[1 | 2 | 3, number | null]> = [[1, policy.nudgeMs[0]], [2, policy.nudgeMs[1]], [3, policy.autoAdvanceMs]];
            for (const [level, ms] of levels) {
                if (ms === null) continue;
                const timer = setTimeout(() => this.fireSilence(level), ms);
                timer.unref();
                this.silenceTimers.push(timer);
            }
        });
    }

    private fireSilence(level: 1 | 2 | 3): void {
        if (this.finalized || this.replyActive || this.voice?.candidateSpeaking) return;
        this.enqueue(async () => {
            await this.perform(this.conductor.onSilence(level));
        });
    }

    // ---------------------------------------------------------------------------------- time

    private tick(): void {
        if (this.finalized) return;
        if (Date.now() - this.startedAt > maxCallMinutes(this.init.interview.format as Format) * 60_000) {
            void this.finalize("time_limit");
            return;
        }
        const turn = this.conductor.onTick();
        if (turn && !this.replyActive) {
            this.abortReply();
            this.enqueue(() => this.perform(turn));
        }
    }

    // ------------------------------------------------------------------------------------ notes

    /** Writes short notes on a finished part, so the model's context stays small however long the interview runs. */
    private async summariseRound(roundKey: string, title: string, transcript: Array<{ role: string; text: string }>): Promise<void> {
        if (transcript.filter((t) => t.role === "candidate").length === 0) return;
        try {
            const text = transcript.map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`).join("\n").slice(0, 9_000);
            const notes = await getLlm().complete([
                { role: "system", content: "You take concise interviewer's notes. In at most 60 words, plainly note what the candidate said and how well they did in this part of a technical interview: concrete strengths, gaps and anything to follow up. Do not invent anything. Plain text only." },
                { role: "user", content: `Part: ${title}\n\n${text}` },
            // Notes are background work: use a fallback model's allowance so the live conversation keeps its own.
            ], { model: models.fallbacks[0] ?? models.dialogue, fallbackModels: [models.dialogue, ...models.fallbacks.slice(1)], maxWaitMs: 30_000, maxTokens: 160, temperature: 0.2, reasoning: "low" });
            this.conductor.setRoundNotes(roundKey, notes.trim());
        } catch (error) {
            llmErrors.inc({ stage: "notes" });
            logger.warn({ err: error, interviewId: this.id }, "Could not write round notes");
        }
    }

    // ---------------------------------------------------------------------------------- helpers

    private send(event: ServerEvent): void {
        this.voice?.send(event);
    }

    private sendNotice(level: "info" | "warning", message: string): void {
        this.send({ type: "NOTICE", level, message });
    }

    // ------------------------------------------------------------------------------ disconnects

    private onVoiceClosed(voice: VoiceLike, reason: string): void {
        if (voice !== this.voice || this.finalized) return;
        logger.info({ interviewId: this.id, reason }, "Call dropped; holding the interview open for a reconnect");
        this.voice = null;
        this.abort?.abort();
        this.clearSilenceTimers();
        this.suspendTimer = setTimeout(() => void this.finalize("disconnected"), this.init.reconnectWindowMs ?? RECONNECT_WINDOW_MS);
        this.suspendTimer.unref();
    }

    // ------------------------------------------------------------------------------- finishing

    /** Discards a call that never really started (the connection failed before the first word). Nothing is saved. */
    async dispose(): Promise<void> {
        if (this.finalized) return;
        this.finalized = true;
        clearTimeout(this.duckTimer);
        clearInterval(this.tickTimer);
        this.clearSilenceTimers();
        this.abort?.abort();
        await this.recorder.close();
        removeLive(this.id);
        this.voice?.close("disposed");
    }

    /** Ends the interview, saves everything and lets the caller start scoring. Safe to call more than once. */
    async finalize(reason: EndReason): Promise<void> {
        if (this.finalized) return;
        this.finalized = true;
        clearInterval(this.tickTimer);
        this.clearSilenceTimers();
        if (this.suspendTimer) clearTimeout(this.suspendTimer);

        const voice = this.voice;
        if (reason === "completed" && voice) {
            // Let the candidate hear the closing words before the page moves on.
            await voice.drained(12_000);
            await new Promise((resolve) => setTimeout(resolve, CLOSING_AUDIO_GRACE_MS));
        } else {
            this.abort?.abort();
        }

        try {
            voice?.send({ type: "STATE", state: "ending" });
            voice?.send({ type: "ENDING", reason, interviewId: this.id });
            await this.chain.catch(() => undefined);
            await this.recorder.close();
            const { substantive } = await finishInterview(this.id, reason);
            interviewsFinished.inc({ reason });
            this.init.onFinished?.(this.id, { substantive, reason });
        } catch (error) {
            logger.error({ err: error, interviewId: this.id }, "Could not finish the interview cleanly");
        } finally {
            removeLive(this.id);
            // Give the browser a moment to receive the ending event before the connection closes.
            setTimeout(() => voice?.close("interview ended"), 1_000).unref();
        }
    }
}

