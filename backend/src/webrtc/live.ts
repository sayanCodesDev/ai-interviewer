import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { clientConcealedPercent, clientLossPercent, codeRuns, firstAudioMs, firstSentenceMs, interviewsFinished, llmErrors, weakConnectionWindows } from "../observability/metrics";
import { getLlm, models, RateLimitedError } from "../llm/client";
import { Conductor, type Outcome, type Turn } from "../interview/conductor";
import { streamReply, type ReplyResult } from "../interview/dialogue";
import { clientMessageSchema, type EndReason, type ServerEvent } from "../interview/events";
import { maxCallMinutes, type Format, type InterviewPlan } from "../interview/plan";
import { getProblemDef, redactHidden, runAll, warmExpected } from "../interview/problems";
import { personaPrompt } from "../interview/prompts";
import { InterviewRecorder } from "../interview/recorder";
import { VOICES, finishInterview, markStarted } from "../interview/service";
import { EchoGuard } from "../voice/echoGuard";
import { isBackchannel, isInterruption, isMoveOnConfirmation } from "../voice/turnTaker";
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
/** After the interviewer says it is moving on, the candidate gets this long to add something before the next question is asked. */
const TRANSITION_BEAT_MS = 1_000;
/** If the candidate is still mid-sentence when the pause ends, wait for them, but not forever. */
const TRANSITION_WAIT_FOR_CANDIDATE_MS = 4_000;
/** Things that appear as the interviewer starts to speak still appear if no sound is ever played (text mode, speech trouble). */
const START_EVENTS_FALLBACK_MS = 6_000;
/** The longest a single spoken turn is waited for. */
const MAX_PLAYBACK_WAIT_MS = 60_000;
/** How much of a reply must have been played for the candidate to have heard it. */
const HEARD_FRACTION = 0.75;
/** When the model has no room, the interviewer says so and tries again this many times before giving up on the turn. */
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_WAIT_MS = 6_000;
/** Said once when the model is busy: enough to sound like thinking, not like a fault. */
const BUSY_FILLERS = ["One moment.", "Give me a second to think about that.", "Sorry, just a moment."];
/** Kinds of turn that answer something the candidate just said. The rest the interviewer starts itself. */
const REPLIES_TO_CANDIDATE: ReadonlySet<string> = new Set(["respond", "coach", "design_respond"]);
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
    /** The pause the candidate gets after "let's move on" before the next question. Shortened in tests. */
    transitionBeatMs?: number;
    /** How long to wait before asking a busy model again. Shortened in tests. */
    rateLimitWaitMs?: number;
    /** Called after the interview is closed and saved, so the caller can start scoring. */
    onFinished?: (interviewId: string, info: { substantive: boolean; reason: EndReason }) => void;
}

/** One spoken turn of the interviewer, from the model starting to write it to its last word being played. */
interface Run {
    controller: AbortController;
    /** The candidate cut in (or the call ended) before the last word was played. */
    interrupted: boolean;
    /** The whole reply was written. */
    generated: boolean;
    /** How much of what was said had been played when it was cut off. */
    playedFraction: number;
    done: boolean;
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
    /** The turn being spoken right now: while it is written, and until its last word has been played. */
    private run: Run | null = null;
    /** When the candidate last did anything that is more than an acknowledgement: spoke, typed, submitted. */
    private candidateStirredAt = 0;
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
            onProblemChosen: (itemId, problemKey) => void this.saveProblemChoice(itemId, problemKey),
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
        for (const event of this.editorEvents()) this.send(event);

        this.abortReply();
        const opening = resuming ? this.conductor.onReconnect() : this.conductor.begin();
        this.begun = true;
        this.enqueue(() => this.perform(opening));
    }

    /** The events that show the current coding problem or notes pad, for a browser that just (re)connected. */
    private editorEvents(): ServerEvent[] {
        const event = this.conductor.editorEvent();
        return event ? [event] : [];
    }

    // ------------------------------------------------------------------------------ candidate input

    private onCandidateSpeaking(text: string, isFinal: boolean): void {
        // The interviewer's own voice coming back through the speakers is not the candidate: don't caption it,
        // and don't stop talking because of it.
        if (config.voiceEchoGuard && this.echo.isEcho(text, 2)) return;

        this.clearSilenceTimers();
        // While a move is pending, a short "yes" or "let's continue" is agreeing to it, not new speech: it
        // must not read as stirring, or it would cancel the very move it is confirming.
        const isStir = this.conductor.hasPendingMove ? !isMoveOnConfirmation(text) : !isBackchannel(text);
        if (isStir) this.candidateStirredAt = Date.now();
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
        this.send({ type: "CAPTION", id: this.candidateCaptionId, role: "candidate", text, final: true });
        this.candidateCaptionId = `c${++this.captionSeq}`;
        // A move the interviewer announced is still pending: "yes", "sure", "let's continue" is confirming it,
        // not a fresh answer about the question just left behind. Leave it alone and let the pause commit the
        // move and ask what comes next, instead of reopening the old topic or silently dropping it either way.
        if (this.conductor.hasPendingMove && isMoveOnConfirmation(text)) return;
        // "Okay", "right", "mm-hmm" after something that was not a question is the candidate listening, not answering:
        // a person carries on rather than reacting to it. It does not interrupt, and it does not call off a move on.
        if (isBackchannel(text) && !this.conductor.lastInterviewerAskedQuestion) return;

        this.candidateStirredAt = Date.now();
        // Let the goodbye finish: the interview is over either way, and the candidate should hear what happens next.
        if (!this.conductor.isClosing) this.abortReply();
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
                this.candidateStirredAt = Date.now();
                this.abortReply();
                this.enqueue(() => this.handleSubmission(message.problemKey, message.language, message.code));
                break;
            case "CODE_SNAPSHOT":
                // Typing is not talking: it neither interrupts the interviewer nor calls off a move on. It is only what they can see.
                this.conductor.noteCode(message.problemKey, message.language, message.code);
                break;
            case "SUBMIT_NOTES":
                this.candidateStirredAt = Date.now();
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

    /** Waits until the candidate is not in the middle of saying something, for at most `maxMs`. */
    private async untilCandidateQuiet(maxMs: number): Promise<void> {
        const until = Date.now() + maxMs;
        while (this.voice?.candidateSpeaking && Date.now() < until && !this.finalized) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    /** Waits, but stops waiting as soon as the candidate cuts in. */
    private async wait(run: Run, ms: number): Promise<void> {
        const until = Date.now() + ms;
        while (Date.now() < until && !run.interrupted && !this.finalized) await new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(1, until - Date.now()))));
    }

    /** Stops the interviewer mid-sentence: what is still being written, and what is still being played. */
    private abortReply(): void {
        this.undip();
        const run = this.run;
        if (run && !run.done && !run.interrupted) {
            // Taken before the audio is cleared: afterwards nothing is left to measure.
            run.playedFraction = this.voice?.playedFraction() ?? 0;
            run.interrupted = true;
        }
        if (this.replyActive) this.abort?.abort();
        if ((this.voice?.queuedMs ?? 0) > 0 || this.replyActive || (run && !run.done)) this.voice?.stopSpeech();
    }

    /**
     * Runs a turn, and the turns that follow it without the candidate speaking. One never starts until the last one has been
     * heard to the end, and a move to the next question waits out a short pause in case the candidate has more to say.
     */
    private async perform(first: Turn | null): Promise<void> {
        let turn = first;
        try {
            for (let guard = 0; turn && guard < 8 && !this.finalized && this.voice; guard++) {
                let outcome = await this.speak(turn);
                if (this.finalized) return;
                for (const event of outcome.events) this.send(event);

                if (outcome.transition) {
                    // The interviewer has said it is moving on. Give the candidate a moment to add something first; if they do,
                    // nothing has moved and they are answered where they are.
                    if (!(await this.beforeMovingOn())) {
                        this.conductor.cancelTransition();
                        break;
                    }
                    outcome = this.conductor.commitTransition();
                    for (const event of outcome.events) this.send(event);
                }
                if (outcome.ended) {
                    void this.finalize(outcome.ended);
                    return;
                }
                turn = outcome.next;
            }
        } catch (error) {
            // Whatever broke mid-turn, the interview must not just go quiet with nothing watching for the
            // candidate: fall through to watchSilence() below the same as a normal turn would.
            logger.error({ err: error, interviewId: this.id }, "A turn failed mid-flight");
        }
        this.watchSilence();
    }

    /** True once the pause after "let's move on" has passed with the candidate silent and the call still up. */
    private async beforeMovingOn(): Promise<boolean> {
        const voice = this.voice;
        if (!voice) return false;
        const started = Date.now();
        const beat = this.init.transitionBeatMs ?? TRANSITION_BEAT_MS;
        while (Date.now() - started < beat) {
            if (this.finalized || voice !== this.voice || voice.isClosed) return false;
            if (this.candidateStirredAt > started) return false;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        // They started to say something as the pause ended: let them finish, then see whether it changes anything.
        const waitStarted = Date.now();
        while (voice.candidateSpeaking && Date.now() - waitStarted < TRANSITION_WAIT_FOR_CANDIDATE_MS) {
            if (this.finalized || voice !== this.voice || voice.isClosed) return false;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return !this.finalized && voice === this.voice && !voice.isClosed && this.candidateStirredAt <= started && !voice.candidateSpeaking;
    }

    private async speak(turn: Turn): Promise<Outcome> {
        const voice = this.voice!;
        this.clearSilenceTimers();
        this.send({ type: "STATE", state: "thinking" });

        const controller = new AbortController();
        const run: Run = { controller, interrupted: false, generated: false, playedFraction: 0, done: false };
        this.abort = controller;
        this.run = run;
        this.replyActive = true;
        const startedAt = Date.now();
        const captionId = `i${++this.captionSeq}`;
        const sentences: string[] = [];

        // Things that belong to the start of this turn (the next part begins) are shown as the interviewer starts to say it.
        let startEventsSent = false;
        const sendStartEvents = () => {
            if (startEventsSent || run.done || run.interrupted) return;
            startEventsSent = true;
            for (const event of turn.events) this.send(event);
        };
        const cancelPlaybackWatch = voice.onPlaybackStart(sendStartEvents);
        const fallback = setTimeout(sendStartEvents, START_EVENTS_FALLBACK_MS);
        fallback.unref();

        await voice.beginSpeech();
        voice.onFirstAudio(() => firstAudioMs.observe(Date.now() - startedAt));

        let result: ReplyResult;
        for (let attempt = 0; ; attempt++) {
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
                run.generated = !result.interrupted;
                break;
            } catch (error) {
                llmErrors.inc({ stage: "dialogue" });
                // A model with no room is not a broken interviewer: say "one moment" like a person would and ask again, rather than
                // apologising and dropping the turn (which, on a free key, used to derail a whole stretch of the interview).
                // (A daily allowance that is used up will not come back in a few seconds, so that is not worth waiting for.)
                const busy = error instanceof RateLimitedError && error.retryAfterMs < 60_000 && attempt < RATE_LIMIT_RETRIES && sentences.length === 0 && !run.interrupted && !this.finalized;
                if (busy) {
                    logger.warn({ interviewId: this.id, kind: turn.kind, attempt: attempt + 1 }, "The interviewer's model is busy; trying again");
                    if (attempt === 0) {
                        const filler = BUSY_FILLERS[this.captionSeq % BUSY_FILLERS.length]!;
                        this.echo.noteSpoken(filler);
                        voice.speak(filler);
                        this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: filler, final: false });
                    }
                    await this.wait(run, Math.max(this.init.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS, Math.min((error as RateLimitedError).retryAfterMs, 15_000)));
                    if (!run.interrupted) continue;
                    result = { text: "", markers: [], interrupted: true, firstSentenceMs: null };
                    break;
                }
                logger.error({ err: error, interviewId: this.id, kind: turn.kind }, "The interviewer's model call failed");
                const proactive = !REPLIES_TO_CANDIDATE.has(turn.kind);
                const apology = error instanceof RateLimitedError
                    ? proactive ? "Sorry, I'm a bit overloaded right now. Give me a moment." : "Sorry, I'm a bit overloaded right now. Give me a moment, then say that again."
                    : proactive ? "Sorry, I had a technical hiccup. Give me a moment." : "Sorry, I had a technical hiccup. Could you say that again?";
                sentences.push(apology);
                this.echo.noteSpoken(apology);
                voice.speak(apology);
                this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: apology, final: false });
                // A failed reply must not move the interview on, so report it as cut off.
                result = { text: apology, markers: [], interrupted: true, firstSentenceMs: null };
                break;
            }
        }

        voice.endSpeech();
        this.replyActive = false;
        const wroteAt = Date.now();

        // The turn is over when its last word has been heard, not when the model finished writing it. Everything the
        // conductor does next (moving on, closing a question) depends on what the candidate actually heard.
        if (!run.interrupted) await voice.drained(MAX_PLAYBACK_WAIT_MS);
        cancelPlaybackWatch();
        clearTimeout(fallback);
        logger.debug({ interviewId: this.id, kind: turn.kind, sentences: sentences.length, wroteMs: wroteAt - startedAt, playedMs: Date.now() - wroteAt, cutIn: run.interrupted }, "Interviewer turn finished");

        const cutIn = run.interrupted;
        if (cutIn && sentences.length > 0) {
            result = { ...result, interrupted: true, text: approximateSpoken(sentences, run.playedFraction), delivered: run.generated && run.playedFraction >= HEARD_FRACTION };
        } else if (cutIn) {
            result = { ...result, interrupted: true, text: "", delivered: false };
        }
        run.done = true;
        if (this.run === run) this.run = null;

        this.send({ type: "CAPTION", id: captionId, role: "interviewer", text: result.text || sentences.join(" "), final: true });
        const outcome = this.conductor.finishTurn(turn, result);
        // Whatever was waiting for this turn to be said is shown now.
        if (!this.finalized) {
            if (!startEventsSent) for (const event of turn.events) this.send(event);
            for (const event of turn.eventsAfter) this.send(event);
        }
        return outcome;
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
            // Time is up, but not mid-sentence: whoever is speaking finishes, then the interviewer closes.
            this.enqueue(async () => {
                await this.untilCandidateQuiet(5_000);
                await this.perform(turn);
            });
        }
    }

    // ------------------------------------------------------------------------------------ problems

    /**
     * The next problem was chosen to suit how the last one went. The plan is what the report is built from, so it is updated,
     * and the problem's expected outputs start being computed so the first submission does not wait for them.
     */
    private async saveProblemChoice(itemId: string, problemKey: string): Promise<void> {
        warmExpected([problemKey]);
        try {
            await prisma.interview.update({ where: { id: this.id }, data: { plan: this.init.plan as unknown as Prisma.InputJsonValue } });
            logger.info({ interviewId: this.id, itemId, problemKey }, "The next problem was chosen for how the candidate is doing");
        } catch (error) {
            logger.error({ err: error, interviewId: this.id, itemId, problemKey }, "Could not save the chosen problem");
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
            // Ending early: stop talking now, or the turn being spoken would hold the interview open until its audio had played out.
            this.abortReply();
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

