import { logger } from "../observability/logger";
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
    private audioBytesQueued = 0;
    private speechEpochBytes = 0;

    private constructor(private readonly params: VoiceParams, private readonly handlers: VoiceHandlers) {
        this.taker = new TurnTaker({
            onTurn: (text) => handlers.onCandidateTurn(text),
            onSpeech: () => undefined,
        });
        this.peer = new AudioPeer({
            onOpusPacket: (payload) => this.forwardAudio(payload),
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
            this.audioBytesQueued += mono.length;
            this.speechEpochBytes += mono.length;
            if (this.firstAudioListeners.length > 0) {
                const listeners = this.firstAudioListeners;
                this.firstAudioListeners = [];
                for (const listener of listeners) listener();
            }
            this.peer.enqueueSpeech(mono);
        });

        connection.on("error", (error: unknown) => logger.warn({ err: error }, "Speech synthesis connection error"));
    }

    /** Resolves when the first audio of the next speech arrives, for latency measurement. */
    onFirstAudio(listener: () => void): void {
        this.firstAudioListeners.push(listener);
    }

    /** Starts a new spoken reply. Waits for any earlier clear to be acknowledged so stale audio can't leak in. */
    async beginSpeech(): Promise<void> {
        if (this.clearAck) await new Promise<void>((resolve) => { const prev = this.clearAck; this.clearAck = () => { prev?.(); resolve(); }; });
        this.speechEpochBytes = 0;
    }

    /** Sends one sentence to the synthesiser. */
    speak(sentence: string): void {
        if (this.tts?.readyState === 1 && sentence.trim()) this.tts.sendText({ type: "Speak", text: sentence });
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

    /** Resolves once everything queued has been played, or after the timeout. */
    async drained(timeoutMs = 30_000): Promise<void> {
        const started = Date.now();
        while (!this.closed && this.peer.queuedMs > 40 && Date.now() - started < timeoutMs) {
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

