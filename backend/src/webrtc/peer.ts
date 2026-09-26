import { writeFileSync } from "node:fs";
import OpusScript from "opusscript";
import { MediaStream, MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket } from "werift";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { audioClockLateWindows, pacerLatenessMs, speechGapMs, speechStartWaitMs } from "../observability/metrics";
import { audioFaults } from "../voice/faults";
import { LatenessMonitor } from "../voice/latenessMonitor";
import { applyGain, gainFromDb } from "../voice/loudness";
import { PcmFrameQueue, SAMPLES_PER_FRAME, nextPacingStep } from "../services/audioQueue";
import { DEFAULT_PLAYOUT, SpeechPlayout } from "./playout";

const TARGET_SAMPLE_RATE = 48_000;
/** Speech is mono: a second channel costs twice the encoding and adds nothing you can hear. */
const TARGET_CHANNELS = 1;
const FRAME_INTERVAL_MS = 20;
/** If the event loop stalls, catch up at most this much rather than bursting. */
const MAX_CATCHUP_FRAMES = 10;
const PCM_BYTES_PER_MS = (TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2) / 1000;

/**
 * Opus settings for a voice, tuned for the internet rather than a lab:
 * - 40 kbit/s mono is transparent for speech; the default would spend more and sound no better.
 * - In-band FEC puts a low-rate copy of the previous frame in each packet, so a lost packet is rebuilt from the
 *   next one instead of being concealed as a glitch. The loss percentage tells the encoder how much to invest.
 * - The signal hint says "this is a human voice".
 */
const OPUS_BITRATE = 40_000;
const OPUS_EXPECTED_LOSS_PERCENT = 8;
const OPUS_CTL = { COMPLEXITY: 4010, INBAND_FEC: 4012, PACKET_LOSS_PERC: 4014, DTX: 4016, SIGNAL: 4024 } as const;
const OPUS_SIGNAL_VOICE = 3001;

/** How far the interviewer's voice dips while the candidate may be interrupting, and how fast it moves per 20 ms frame. */
const DUCK_LEVEL = 0.3;
const DUCK_ATTACK = 0.25;
const DUCK_RELEASE = 0.05;

/**
 * Diagnostic for "the voice glitches": with AUDIO_DEBUG_DUMP=/some/prefix, everything this server actually sent
 * (speech and the silence between) is written to <prefix>.wav when the call closes. Playing it back, or running
 * it through a speech recogniser, shows whether a glitch was made here or on the way to the browser.
 */
const DEBUG_DUMP = process.env.AUDIO_DEBUG_DUMP ?? "";

export interface PeerHandlers {
    /** A raw Opus packet from the candidate's microphone. */
    onOpusPacket: (payload: Buffer) => void;
    /** A text message from the browser over the data channel. */
    onMessage: (data: string) => void;
    /** The data channel is open and events can be sent. */
    onChannelOpen: () => void;
    /** The connection ended or failed. */
    onClosed: (reason: string) => void;
    /** The first word of speech is now being played (after any smoothing pre-roll). */
    onSpeechStart?: () => void;
}

/**
 * One WebRTC connection to a candidate's browser: their microphone in, the interviewer's voice out,
 * and a data channel for events. Speech arrives as PCM and is paced out as 20 ms Opus packets.
 *
 * The pacer sends silence when there is nothing to say instead of pausing: a stalled RTP clock makes
 * the browser's playout drift, heard as the voice freezing and resuming mid-word.
 */
export class AudioPeer {
    private readonly pc: RTCPeerConnection;
    private readonly track: MediaStreamTrack;
    private encoder: OpusScript | null;
    private readonly playout: SpeechPlayout;
    private readonly dumped: Buffer[] = [];
    private channel: { readyState: string; send: (data: string) => void; onmessage: unknown } | null = null;
    private pacer: NodeJS.Timeout | null = null;
    private closed = false;

    private sequence = 0;
    private timestamp = 0;
    private readonly silence = Buffer.alloc(SAMPLES_PER_FRAME * 2 * TARGET_CHANNELS);
    private nextFrameDueAt = Date.now();
    private readonly lateness = new LatenessMonitor();
    private readonly gain = gainFromDb(config.voiceGainDb);
    /** 1 normally, lower while the interviewer is "ducked" for a possible interruption; eased toward its target each frame. */
    private duckTarget = 1;
    private duckLevel = 1;

    constructor(private readonly handlers: PeerHandlers) {
        this.encoder = new OpusScript(TARGET_SAMPLE_RATE, TARGET_CHANNELS, OpusScript.Application.VOIP);
        this.tuneEncoder(this.encoder);
        this.playout = new SpeechPlayout(new PcmFrameQueue(undefined, TARGET_CHANNELS), { ...DEFAULT_PLAYOUT, preRollMs: config.voicePreRollMs, resumeMs: config.voiceResumeMs, maxLeadMs: config.voiceMaxLeadMs }, {
            onStart: (waited) => {
                speechStartWaitMs.observe(waited);
                this.handlers.onSpeechStart?.();
            },
            onGap: (gap) => {
                speechGapMs.observe(gap);
                logger.debug({ gapMs: gap }, "Speech ran dry and resumed");
            },
        });

        this.pc = new RTCPeerConnection({
            iceServers: config.stunUrls.map((urls) => ({ urls })),
            // Behind NAT or a cloud load balancer the browser can only reach a fixed public address and port range.
            ...(config.webrtcPortRange ? { icePortRange: config.webrtcPortRange } : {}),
            ...(config.webrtcPublicIp ? { iceAdditionalHostAddresses: [config.webrtcPublicIp] } : {}),
        });

        this.track = new MediaStreamTrack({ kind: "audio" });
        this.pc.addTransceiver(this.track, {
            direction: "sendrecv",
            streams: [new MediaStream({ id: "interviewer-voice", tracks: [this.track] })],
        });

        let micPackets = 0;
        this.pc.ontrack = (event: any) => {
            event.track.onReceiveRtp.subscribe((rtp: any) => {
                // The first packet proves the browser's microphone is really reaching us: "the interviewer never hears me" starts here.
                if (micPackets++ === 0) logger.info("Microphone audio is arriving");
                else if (micPackets % 3000 === 0) logger.debug({ micPackets }, "Microphone audio still arriving");
                try {
                    this.handlers.onOpusPacket(Buffer.from(rtp.payload));
                } catch (error) {
                    logger.error({ err: error }, "Failed to forward microphone audio");
                }
            });
        };

        this.pc.ondatachannel = (event: any) => {
            this.channel = event.channel;
            event.channel.onmessage = (message: { data: unknown }) => {
                if (typeof message.data === "string") this.handlers.onMessage(message.data);
            };
            // The channel arrives already open in werift; announce on the next tick so callers finish wiring first.
            setImmediate(() => this.handlers.onChannelOpen());
        };

        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            if (state === "disconnected" || state === "failed" || state === "closed") this.close(`connection ${state}`);
        };

        this.startPacer();
    }

    /** Completes the WebRTC handshake for the browser's offer. */
    async accept(offer: { sdp: string; type: "offer" }): Promise<{ sdp: string; type: string }> {
        await this.pc.setRemoteDescription(offer as never);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        return { sdp: this.pc.localDescription!.sdp, type: this.pc.localDescription!.type };
    }

    // ------------------------------------------------------------------------------------ speaking

    /** Queues mono 16-bit 48 kHz PCM from the speech synthesiser. It is played once a small buffer has built up. */
    enqueueSpeech(mono: Buffer): void {
        this.playout.enqueue(mono);
    }

    /** Whether the synthesiser still has audio coming for the reply being spoken. */
    expectMoreSpeech(more: boolean): void {
        this.playout.expectMore(more);
    }

    /** About how much speech some just-sent text will make, so the buffer can be sized to what is still to come. */
    expectSpeechDuration(ms: number): void {
        this.playout.expectAudio(ms);
    }

    /**
     * Turns the interviewer down (or back up) smoothly. Used when the candidate might be interrupting: dipping the voice at
     * once feels responsive, and if it was only noise or an echo the voice comes back instead of having been cut off.
     */
    setDuck(active: boolean): void {
        this.duckTarget = active ? DUCK_LEVEL : 1;
    }

    /** Drops everything queued but not yet sent (barge-in). */
    clearSpeech(): void {
        this.playout.clear();
    }

    /** Milliseconds of speech waiting to be heard. */
    get queuedMs(): number {
        return this.playout.queuedMs;
    }

    /** Whether the interviewer is speaking, or about to: audio is queued, playing, or still being made. */
    get speechActive(): boolean {
        return this.playout.active;
    }

    private tuneEncoder(encoder: OpusScript): void {
        try {
            encoder.setBitrate(OPUS_BITRATE);
            encoder.encoderCTL(OPUS_CTL.COMPLEXITY, 9);
            encoder.encoderCTL(OPUS_CTL.INBAND_FEC, audioFaults.noFec ? 0 : 1);
            encoder.encoderCTL(OPUS_CTL.PACKET_LOSS_PERC, OPUS_EXPECTED_LOSS_PERCENT);
            encoder.encoderCTL(OPUS_CTL.DTX, 0);
            encoder.encoderCTL(OPUS_CTL.SIGNAL, OPUS_SIGNAL_VOICE);
        } catch (error) {
            // The defaults still work; the voice just loses its loss protection.
            logger.warn({ err: error }, "Could not tune the Opus encoder");
        }
    }

    private sendFrame(): void {
        if (!this.encoder) return;
        const frame = this.playout.next();
        // Ease toward the ducking target: quickly down (about 60 ms), slowly back up (about 300 ms).
        if (this.duckLevel !== this.duckTarget) {
            const step = this.duckTarget < this.duckLevel ? DUCK_ATTACK : DUCK_RELEASE;
            this.duckLevel = this.duckTarget < this.duckLevel ? Math.max(this.duckTarget, this.duckLevel - step) : Math.min(this.duckTarget, this.duckLevel + step);
        }
        if (frame) applyGain(frame, this.gain * this.duckLevel);
        if (DEBUG_DUMP) this.dumped.push(Buffer.from(frame ?? this.silence));
        try {
            const opus = this.encoder.encode(frame ?? this.silence, SAMPLES_PER_FRAME);
            const header = new RtpHeader({
                version: 2,
                padding: false,
                extension: false,
                // A continuous stream: silence is sent as silence (never suppressed), so there are no talkspurts to mark.
                marker: false,
                payloadType: 111,
                sequenceNumber: this.sequence++ & 0xffff,
                timestamp: (this.timestamp += SAMPLES_PER_FRAME),
                ssrc: 98765,
            });
            // Test only: drop a share of packets after numbering them, exactly as a lossy network would.
            if (audioFaults.lossPercent > 0 && Math.random() * 100 < audioFaults.lossPercent) return;
            this.track.writeRtp(new RtpPacket(header, opus));
        } catch (error) {
            logger.error({ err: error }, "Failed to encode or send an audio frame");
        }
    }

    private startPacer(): void {
        // Tick faster than the frame rate and send whatever is due; setInterval drifts and coalesces under load.
        this.pacer = setInterval(() => {
            const now = Date.now();
            const step = nextPacingStep(now, this.nextFrameDueAt, FRAME_INTERVAL_MS, MAX_CATCHUP_FRAMES);
            if (step.frames > 0) {
                const late = Math.max(0, now - this.nextFrameDueAt);
                pacerLatenessMs.observe(late);
                const warning = this.lateness.note(late, now);
                if (warning) {
                    audioClockLateWindows.inc();
                    logger.warn(warning, "The server's audio clock is running late, so the interviewer's voice will break up. Something is keeping this process from running on time: a busy computer, a laptop saving power, or a slow operation blocking the event loop.");
                }
            }
            this.nextFrameDueAt = step.nextDueAt;
            for (let i = 0; i < step.frames; i++) this.sendFrame();
        }, 5);
    }

    // ---------------------------------------------------------------------------------- data channel

    send(event: object): boolean {
        if (this.channel?.readyState !== "open") return false;
        try {
            this.channel.send(JSON.stringify(event));
            return true;
        } catch {
            return false;
        }
    }

    get isOpen(): boolean {
        return !this.closed;
    }

    private writeDump(): void {
        try {
            const pcm = Buffer.concat(this.dumped);
            const wav = Buffer.alloc(44 + pcm.length);
            wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(TARGET_CHANNELS, 22);
            wav.writeUInt32LE(TARGET_SAMPLE_RATE, 24); wav.writeUInt32LE(TARGET_SAMPLE_RATE * 2 * TARGET_CHANNELS, 28); wav.writeUInt16LE(2 * TARGET_CHANNELS, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40);
            pcm.copy(wav, 44);
            writeFileSync(`${DEBUG_DUMP}.wav`, wav);
            logger.info({ file: `${DEBUG_DUMP}.wav`, seconds: Math.round(pcm.length / (TARGET_SAMPLE_RATE * 2 * TARGET_CHANNELS)) }, "Wrote the audio this call sent");
        } catch (error) {
            logger.warn({ err: error }, "Could not write the audio dump");
        }
    }

    close(reason = "closed"): void {
        if (this.closed) return;
        this.closed = true;
        if (DEBUG_DUMP && this.dumped.length > 0) this.writeDump();
        if (this.pacer) clearInterval(this.pacer);
        this.pacer = null;
        try { void this.pc.close(); } catch { /* already closed */ }
        try { this.encoder?.delete?.(); } catch { /* wasm heap already freed */ }
        this.encoder = null;
        this.handlers.onClosed(reason);
    }
}
