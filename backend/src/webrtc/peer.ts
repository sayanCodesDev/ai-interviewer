import OpusScript from "opusscript";
import { MediaStream, MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket } from "werift";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { FRAME_BYTES, PcmFrameQueue, SAMPLES_PER_FRAME, nextPacingStep } from "../services/audioQueue";

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNELS = 2;
const FRAME_INTERVAL_MS = 20;
/** If the event loop stalls, catch up at most this much rather than bursting. */
const MAX_CATCHUP_FRAMES = 10;
const PCM_BYTES_PER_MS = (TARGET_SAMPLE_RATE * TARGET_CHANNELS * 2) / 1000;

export interface PeerHandlers {
    /** A raw Opus packet from the candidate's microphone. */
    onOpusPacket: (payload: Buffer) => void;
    /** A text message from the browser over the data channel. */
    onMessage: (data: string) => void;
    /** The data channel is open and events can be sent. */
    onChannelOpen: () => void;
    /** The connection ended or failed. */
    onClosed: (reason: string) => void;
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
    private readonly pcm = new PcmFrameQueue();
    private channel: { readyState: string; send: (data: string) => void; onmessage: unknown } | null = null;
    private pacer: NodeJS.Timeout | null = null;
    private closed = false;

    private sequence = 0;
    private timestamp = 0;
    private wasSilent = true;
    private readonly silence = Buffer.alloc(FRAME_BYTES);
    private nextFrameDueAt = Date.now();

    constructor(private readonly handlers: PeerHandlers) {
        this.encoder = new OpusScript(TARGET_SAMPLE_RATE, TARGET_CHANNELS, OpusScript.Application.VOIP);

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

        this.pc.ontrack = (event: any) => {
            event.track.onReceiveRtp.subscribe((rtp: any) => {
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

    /** Queues mono 16-bit 48 kHz PCM from the speech synthesiser. */
    enqueueSpeech(mono: Buffer): void {
        this.pcm.enqueueMono(mono);
    }

    /** Drops everything queued but not yet sent (barge-in). */
    clearSpeech(): void {
        this.pcm.reset();
    }

    /** Milliseconds of speech waiting to be heard. */
    get queuedMs(): number {
        return this.pcm.pendingBytes / PCM_BYTES_PER_MS;
    }

    private sendFrame(): void {
        if (!this.encoder) return;
        const frame = this.pcm.readFrame();
        const isSilence = frame === null;
        try {
            const opus = this.encoder.encode(frame ?? this.silence, SAMPLES_PER_FRAME);
            const header = new RtpHeader({
                version: 2,
                padding: false,
                extension: false,
                marker: this.wasSilent && !isSilence,
                payloadType: 111,
                sequenceNumber: this.sequence++ & 0xffff,
                timestamp: (this.timestamp += SAMPLES_PER_FRAME),
                ssrc: 98765,
            });
            this.track.writeRtp(new RtpPacket(header, opus));
            this.wasSilent = isSilence;
        } catch (error) {
            logger.error({ err: error }, "Failed to encode or send an audio frame");
        }
    }

    private startPacer(): void {
        // Tick faster than the frame rate and send whatever is due; setInterval drifts and coalesces under load.
        this.pacer = setInterval(() => {
            const step = nextPacingStep(Date.now(), this.nextFrameDueAt, FRAME_INTERVAL_MS, MAX_CATCHUP_FRAMES);
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

    close(reason = "closed"): void {
        if (this.closed) return;
        this.closed = true;
        if (this.pacer) clearInterval(this.pacer);
        this.pacer = null;
        try { void this.pc.close(); } catch { /* already closed */ }
        try { this.encoder?.delete?.(); } catch { /* wasm heap already freed */ }
        this.encoder = null;
        this.handlers.onClosed(reason);
    }
}
