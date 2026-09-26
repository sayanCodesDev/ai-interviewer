import { logger } from "../observability/logger";
import { ttsFirstAudioMs } from "../observability/metrics";
import { audioFaults } from "../voice/faults";
import { estimateSpeechMs, speechText } from "../voice/speechText";
import { TurnTaker } from "../voice/turnTaker";
import { connectStt, type SttConnection } from "../voice/stt";
import { connectTts, type TtsConnection } from "../voice/tts";
import { config } from "../config/env";
import { AudioPeer } from "./peer";

export interface VoiceParams {
    accent: string;
    keyterms: string[];
    voice: string;
}

export interface VoiceHandlers {
    /** The candidate finished an utterance. */
    onCandidateTurn: (text: string) => void;
    /** The candidate is saying something. Text is the transcript so far. */
    onCandidateSpeaking: (text: string, isFinal: boolean) => void;
    onClientMessage: (data: string) => void;
    onChannelOpen: () => void;
    onClosed: (reason: string) => void;
    /** Non-fatal trouble the candidate should hear about (e.g. the recogniser reconnecting). */
    onNotice: (message: string) => void;
}

/** What the interview needs from the sound layer. The real implementation is Voice; tests substitute a fake. */
export interface VoiceLike {
    beginSpeech(): Promise<void>;
    speak(sentence: string): void;
    endSpeech(): void;
    stopSpeech(): void;
    onFirstAudio(listener: () => void): void;
    readonly queuedMs: number;
    playedFraction(): number;
    drained(timeoutMs?: number): Promise<void>;
    readonly candidateSpeaking: boolean;
    send(event: object): boolean;
    close(reason?: string): void;
    readonly isClosed: boolean;
    /** Dip the interviewer's voice while the candidate may be interrupting, or bring it back. Optional: only a real call has volume. */
    duck?(active: boolean): void;
    /** Calls `listener` when the first word of the next speech is actually played. Returns a function that cancels the wait. */
    onPlaybackStart(listener: () => void): () => void;
}

export type VoiceFactory = (
    offer: { sdp: string; type: "offer" },
    params: VoiceParams,
    handlers: VoiceHandlers,
) => Promise<{ voice: VoiceLike; answer: { sdp: string; type: string } }>;

const CLEAR_ACK_TIMEOUT_MS = 500;
const STT_RECONNECT_ATTEMPTS = 3;

/**
 * Everything to do with sound on one call: the browser connection, speech recognition, speech
 * synthesis and the turn-taking between them. The interview logic above it only sees "the candidate
 * finished talking" and "say this".
 */
export class Voice implements VoiceLike {
    private stt: SttConnection | null = null;
    private tts: TtsConnection | null = null;
    private readonly taker: TurnTaker;
    private readonly peer: AudioPeer;
    private closed = false;

    /** True from stopSpeech() until synthesis acknowledges the clear, so stale audio is never played. */
    private dropAudio = false;
    private clearAck: (() => void) | null = null;
    private firstAudioListeners: Array<() => void> = [];
    /** When the first sentence of the current reply went to the synthesiser, to time how long it took to answer. */
    private spokeAt = 0;
    private chunksSeen = 0;
    /** Keeps audio in order when a test is delaying its delivery. */
    private delivery: Promise<void> = Promise.resolve();
    private playbackListeners: Array<() => void> = [];
    private audioBytesQueued = 0;
    private speechEpochBytes = 0;

    private constructor(private readonly params: VoiceParams, private readonly handlers: VoiceHandlers) {
        this.taker = new TurnTaker({
            onTurn: (text) => handlers.onCandidateTurn(text),
            onSpeech: () => undefined,
        });
        this.peer = new AudioPeer({
            onOpusPacket: (payload) => this.forwardAudio(payload),
            onSpeechStart: () => this.playbackStarted(),
            onMessage: (data) => handlers.onClientMessage(data),
            onChannelOpen: () => handlers.onChannelOpen(),
            onClosed: (reason) => this.shutdown(reason),
        });
    }

    /** Connects everything and returns the SDP answer to give the browser. */
    static async open(offer: { sdp: string; type: "offer" }, params: VoiceParams, handlers: VoiceHandlers): Promise<{ voice: Voice; answer: { sdp: string; type: string } }> {
        const voice = new Voice(params, handlers);
        try {
            // In text mode (development and tests) nobody speaks: skip recognition and synthesis entirely.
            if (config.voiceMode === "live") {
                voice.stt = await connectStt({ accent: params.accent, keyterms: params.keyterms });
                voice.wireStt(voice.stt);
                voice.tts = await connectTts(params.voice);
                voice.wireTts(voice.tts);
            }
            const answer = await voice.peer.accept(offer);
            return { voice, answer };
        } catch (error) {
            voice.shutdown("setup failed");
            throw error;
        }
    }

    // ---------------------------------------------------------------------------- listening

    private forwardAudio(payload: Buffer): void {
        const socket = this.stt;
        if (socket && socket.readyState === 1) socket.socket.send(payload);
    }

    private wireStt(connection: SttConnection): void {
        connection.on("message", (message: any) => {
            if (this.closed) return;
            if (message.type === "UtteranceEnd") {
                this.taker.onUtteranceEnd();
                return;
            }
            const text: string | undefined = message.channel?.alternatives?.[0]?.transcript;
            if (message.type !== "Results" || !text?.trim()) return;

            const isFinal = Boolean(message.is_final);
            this.handlers.onCandidateSpeaking(text.trim(), isFinal);
            this.taker.onTranscript({ text, isFinal, speechFinal: Boolean(message.speech_final) });
        });

        connection.on("error", (error: unknown) => logger.warn({ err: error }, "Speech recognition connection error"));
        connection.on("close", () => {
            if (this.closed || this.stt !== connection) return;
            this.stt = null;
            void this.reconnectStt();
        });
    }

    /** Recognition dropped mid-call. Try to get it back rather than leaving the candidate unheard. */
    private async reconnectStt(): Promise<void> {
        for (let attempt = 1; attempt <= STT_RECONNECT_ATTEMPTS && !this.closed; attempt++) {
            this.handlers.onNotice("Reconnecting speech recognition…");
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            try {
                const next = await connectStt({ accent: this.params.accent, keyterms: this.params.keyterms });
                if (this.closed) { next.close(); return; }
                this.stt = next;
                this.wireStt(next);
                this.handlers.onNotice("Speech recognition is back.");
                return;
            } catch (error) {
                logger.warn({ err: error, attempt }, "Could not reconnect speech recognition");
            }
        }
        if (!this.closed) this.handlers.onClosed("speech recognition lost");
    }

    // ---------------------------------------------------------------------------- speaking

    private wireTts(connection: TtsConnection): void {
        const raw = (connection as any).socket;
        if (!raw) return;
        // The SDK's message handler parses JSON, which breaks on binary audio, so read the raw socket.
        raw.binaryType = "nodebuffer";
        if (raw.socket) raw.socket.binaryType = "nodebuffer";

        const deliver = (mono: Buffer) => {
            if (this.dropAudio || this.closed) return;
            if (this.spokeAt > 0) {
                ttsFirstAudioMs.observe(Date.now() - this.spokeAt);
                this.spokeAt = 0;
            }
            this.audioBytesQueued += mono.length;
            this.speechEpochBytes += mono.length;
            if (this.firstAudioListeners.length > 0) {
                const listeners = this.firstAudioListeners;
                this.firstAudioListeners = [];
                for (const listener of listeners) listener();
            }
            this.peer.enqueueSpeech(mono);
        };

        raw.addEventListener("message", async (event: any) => {
            let data = event.data;
            if (typeof Blob !== "undefined" && data instanceof Blob) data = Buffer.from(await data.arrayBuffer());

            if (typeof data === "string") {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "Cleared") {
                        this.dropAudio = false;
                        this.clearAck?.();
                        this.clearAck = null;
                    } else if (parsed.type === "Flushed") {
                        // Everything sent so far has been synthesised: nothing more is coming for this reply.
                        if (audioFaults.ttsStallMs > 0 || audioFaults.ttsRate > 0) this.delivery = this.delivery.then(() => this.peer.expectMoreSpeech(false));
                        else this.peer.expectMoreSpeech(false);
                    } else if (parsed.type === "Warning") {
                        logger.warn({ warning: parsed.description }, "Speech synthesis warning");
                    }
                } catch {
                    /* not a control message */
                }
                return;
            }
            if (this.dropAudio || this.closed) return;

            const mono = Buffer.isBuffer(data) ? data : Buffer.from(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
            if ((audioFaults.ttsStallEvery > 0 && audioFaults.ttsStallMs > 0) || audioFaults.ttsRate > 0) {
                // Test only: deliver audio late, in order, as a slow provider or network would.
                const stall = audioFaults.ttsStallEvery > 0 && ++this.chunksSeen % audioFaults.ttsStallEvery === 0 ? audioFaults.ttsStallMs : 0;
                const pace = audioFaults.ttsRate > 0 ? mono.length / 96 / audioFaults.ttsRate : 0; // wait this long per chunk
                this.delivery = this.delivery.then(async () => {
                    if (stall + pace > 0) await new Promise((resolve) => setTimeout(resolve, stall + pace));
                    deliver(mono);
                });
                return;
            }
            deliver(mono);
        });

        connection.on("error", (error: unknown) => {
            logger.warn({ err: error }, "Speech synthesis connection error");
            this.peer.expectMoreSpeech(false);
        });
        connection.on("close", () => this.peer.expectMoreSpeech(false));
    }

    private playbackStarted(): void {
        const listeners = this.playbackListeners;
        this.playbackListeners = [];
        for (const listener of listeners) listener();
    }

    /** Calls `listener` once the next speech is actually being played. With no speech connection (text mode) there is nothing to wait for. */
    onPlaybackStart(listener: () => void): () => void {
        if (!this.tts) {
            queueMicrotask(listener);
            return () => undefined;
        }
        this.playbackListeners.push(listener);
        return () => {
            this.playbackListeners = this.playbackListeners.filter((l) => l !== listener);
        };
    }

    /** Resolves when the first audio of the next speech arrives, for latency measurement. */
    onFirstAudio(listener: () => void): void {
        this.firstAudioListeners.push(listener);
    }

    /** Opens a fresh connection to the speech service if the old one has gone, so a dropped connection doesn't leave the interviewer mute. */
    private async ensureTts(): Promise<void> {
        if (config.voiceMode !== "live" || this.closed || this.tts?.readyState === 1) return;
        for (let attempt = 1; attempt <= 2 && !this.closed; attempt++) {
            try {
                const next = await connectTts(this.params.voice);
                if (this.closed) { next.close(); return; }
                try { this.tts?.close(); } catch { /* already closed */ }
                this.tts = next;
                this.wireTts(next);
                logger.info({ attempt }, "Speech synthesis connection restored");
                return;
            } catch (error) {
                logger.warn({ err: error, attempt }, "Could not reconnect speech synthesis");
                await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
            }
        }
    }

    /** Starts a new spoken reply. Waits for any earlier clear to be acknowledged so stale audio can't leak in. */
    async beginSpeech(): Promise<void> {
        await this.ensureTts();
        if (this.clearAck) await new Promise<void>((resolve) => { const prev = this.clearAck; this.clearAck = () => { prev?.(); resolve(); }; });
        this.speechEpochBytes = 0;
    }

    /** Sends one sentence to the synthesiser, rewritten so code, symbols and shorthand are said the way a person would. */
    speak(sentence: string): void {
        const text = speechText(sentence);
        if (this.tts?.readyState === 1 && text) {
            if (this.spokeAt === 0) this.spokeAt = Date.now();
            this.peer.expectMoreSpeech(true);
            this.peer.expectSpeechDuration(estimateSpeechMs(text));
            this.tts.sendText({ type: "Speak", text });
        }
    }

    /** Tells the synthesiser no more text is coming for this reply, so it finishes the last sentence. */
    endSpeech(): void {
        if (this.tts?.readyState === 1) this.tts.sendFlush({ type: "Flush" });
    }

    /** Barge-in: silence the interviewer immediately and drop anything still in flight. */
    stopSpeech(): void {
        this.peer.clearSpeech();
        if (this.tts?.readyState === 1) {
            this.dropAudio = true;
            this.tts.sendClear({ type: "Clear" });
            // If the acknowledgement never comes, don't stay deaf to new speech forever.
            const timeout = setTimeout(() => { this.dropAudio = false; this.clearAck?.(); this.clearAck = null; }, CLEAR_ACK_TIMEOUT_MS);
            timeout.unref();
            this.clearAck = () => clearTimeout(timeout);
        }
    }

    duck(active: boolean): void {
        this.peer.setDuck(active);
    }

    /** Milliseconds of speech still to be heard. */
    get queuedMs(): number {
        return this.peer.queuedMs;
    }

    /** Roughly how much of the current reply the candidate has already heard, from 0 to 1. */
    playedFraction(): number {
        if (this.speechEpochBytes === 0) return 0;
        const remainingBytes = this.peer.queuedMs * 96; // 48 kHz mono 16-bit = 96 bytes per ms
        return Math.max(0, Math.min(1, 1 - remainingBytes / this.speechEpochBytes));
    }

    /**
     * Resolves once the speech has been played to its last word, or after the timeout. "Nothing is queued" is not enough:
     * a moment after a reply is sent to the synthesiser its first audio has not arrived, so the queue is still empty.
     */
    async drained(timeoutMs = 30_000): Promise<void> {
        const started = Date.now();
        while (!this.closed && (this.peer.queuedMs > 40 || this.peer.speechActive) && Date.now() - started < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 60));
        }
    }

    /** Whether the candidate is currently mid-utterance (or a turn is waiting to be handed off). */
    get candidateSpeaking(): boolean {
        return this.taker.hasPending;
    }

    send(event: object): boolean {
        return this.peer.send(event);
    }

    // ---------------------------------------------------------------------------- closing

    private shutdown(reason: string): void {
        if (this.closed) return;
        this.closed = true;
        this.taker.dispose();
        try { this.stt?.close(); } catch { /* already closed */ }
        try { this.tts?.close(); } catch { /* already closed */ }
        this.stt = null;
        this.tts = null;
        this.peer.close(reason);
        this.handlers.onClosed(reason);
    }

    close(reason = "closed"): void {
        this.shutdown(reason);
    }

    get isClosed(): boolean {
        return this.closed;
    }
}

