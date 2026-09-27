/**
 * Jitter buffer between Deepgram TTS and the WebRTC Opus pacer.
 *
 * Deepgram streams synthesised speech far faster than real time, in mono 16-bit
 * linear PCM chunks of arbitrary length. The pacer needs exactly one 20ms stereo
 * frame every 20ms. This queue bridges the two.
 *
 * It exists as its own class because the naive version of this — one Buffer that
 * every arriving chunk was `Buffer.concat`ed onto — is O(n^2): on a long answer it
 * copied megabytes per incoming websocket frame, starved the pacer's timer and made
 * the voice stutter and freeze.
 */

/** 20ms at 48kHz. */
export const SAMPLES_PER_FRAME = 960;
/** One frame of 16-bit stereo PCM. */
export const FRAME_BYTES = SAMPLES_PER_FRAME * 2 * 2;
/** Frames per second (one every 20 ms). */
const FRAMES_PER_SECOND = 50;

/** Roughly 30 seconds of audio, after which the oldest is dropped. */
const MAX_SECONDS = 30;

export class PcmFrameQueue {
    private readonly chunks: Buffer[] = [];
    private pending = 0;
    private headOffset = 0;
    /** A websocket frame can end mid-sample; the stray byte belongs to the next one. */
    private oddByteCarry: Buffer | null = null;
    private readonly frameBytes: number;
    private readonly maxBytes: number;

    /**
     * @param channels 2 (the default) interleaves the mono input to identical stereo channels; 1 keeps it mono,
     * which is what the voice call uses: speech needs no second channel and mono encodes at half the cost.
     */
    constructor(maxBytes?: number, private readonly channels: 1 | 2 = 2) {
        this.frameBytes = SAMPLES_PER_FRAME * 2 * channels;
        this.maxBytes = maxBytes ?? this.frameBytes * FRAMES_PER_SECOND * MAX_SECONDS;
    }

    /** Unread bytes held in the queue (in this queue's channel layout). */
    get pendingBytes(): number {
        return this.pending;
    }

    /** Milliseconds of audio waiting in the queue, including a last partial frame. */
    get durationMs(): number {
        return (this.pending / this.frameBytes) * 20;
    }

    /** Whole frames available to read right now. */
    get availableFrames(): number {
        return Math.floor(this.pending / this.frameBytes);
    }

    /** Bytes in one 20 ms frame. */
    get bytesPerFrame(): number {
        return this.frameBytes;
    }

    /**
     * Accepts one mono 16-bit little-endian chunk and interleaves it to stereo.
     *
     * Reads sample-by-sample off the byte buffer rather than casting to an
     * Int16Array: the cast throws on an odd byteLength, and working around that by
     * truncating shifts every later sample by one byte, which decodes as white noise.
     */
    enqueueMono(monoBytes: Buffer): void {
        let input = monoBytes;
        if (this.oddByteCarry) {
            input = Buffer.concat([this.oddByteCarry, input]);
            this.oddByteCarry = null;
        }

        const usableBytes = input.length - (input.length % 2);
        if (usableBytes < input.length) {
            this.oddByteCarry = Buffer.from(input.subarray(usableBytes));
        }
        if (usableBytes === 0) return;

        let block: Buffer;
        if (this.channels === 1) {
            // Copy: the socket may reuse its buffer after this returns.
            block = Buffer.from(input.subarray(0, usableBytes));
        } else {
            block = Buffer.allocUnsafe(usableBytes * 2);
            let offset = 0;
            for (let i = 0; i < usableBytes; i += 2) {
                const sample = input.readInt16LE(i);
                block.writeInt16LE(sample, offset);     // Left
                block.writeInt16LE(sample, offset + 2); // Right
                offset += 4;
            }
        }

        this.chunks.push(block);
        this.pending += block.length;
        this.dropOldestIfOverfull();
    }

    /**
     * One 20ms frame, or null on underrun (the pacer then sends silence). With `padTail`, a last partial frame
     * (the end of an utterance rarely lands on a 20 ms boundary) is padded with silence instead of being left behind
     * to leak into the start of the next utterance.
     */
    readFrame(padTail = false): Buffer | null {
        const size = this.frameBytes;
        if (this.pending < size) {
            if (!padTail || this.pending === 0) return null;
            const tail = Buffer.alloc(size);
            let written = 0;
            while (this.pending > 0) {
                const chunk = this.chunks[0]!;
                const take = Math.min(chunk.length - this.headOffset, this.pending);
                chunk.copy(tail, written, this.headOffset, this.headOffset + take);
                written += take;
                this.advance(take);
            }
            return tail;
        }

        const head = this.chunks[0]!;

        // Fast path: the head chunk alone covers a whole frame, no copy needed.
        if (head.length - this.headOffset >= size) {
            const frame = head.subarray(this.headOffset, this.headOffset + size);
            this.advance(size);
            return frame;
        }

        // Slow path: stitch across chunk boundaries.
        const frame = Buffer.allocUnsafe(size);
        let written = 0;
        while (written < size) {
            const chunk = this.chunks[0]!;
            const take = Math.min(chunk.length - this.headOffset, size - written);
            chunk.copy(frame, written, this.headOffset, this.headOffset + take);
            written += take;
            this.advance(take);
        }
        return frame;
    }

    /** Drops every buffered sample. Used on barge-in, so stale speech is never heard. */
    reset(): void {
        this.chunks.length = 0;
        this.pending = 0;
        this.headOffset = 0;
        this.oddByteCarry = null;
    }

    private advance(bytes: number): void {
        this.headOffset += bytes;
        this.pending -= bytes;
        const head = this.chunks[0];
        if (head && this.headOffset >= head.length) {
            this.chunks.shift();
            this.headOffset = 0;
        }
    }

    private dropOldestIfOverfull(): void {
        while (this.pending > this.maxBytes && this.chunks.length > 1) {
            const dropped = this.chunks.shift()!;
            this.pending -= dropped.length - this.headOffset;
            this.headOffset = 0;
        }
    }
}

export interface PacingStep {
    /** How many 20ms frames to emit on this tick. */
    frames: number;
    /** The wall-clock time the frame after those is due. */
    nextDueAt: number;
}

/**
 * Decides how many frames the pacer owes at time `now`.
 *
 * `setInterval` drifts and coalesces under load, so emitting exactly one frame per
 * tick loses real time whenever a tick runs late — and because the RTP timestamp
 * only advances per packet sent, that desynchronises the receiver's playout clock.
 * This catches back up instead, and resynchronises outright if it has fallen so far
 * behind that catching up would mean a long burst.
 */
export function nextPacingStep(
    now: number,
    nextDueAt: number,
    intervalMs: number,
    maxCatchupFrames: number
): PacingStep {
    let frames = Math.floor((now - nextDueAt) / intervalMs) + 1;
    if (frames <= 0) return { frames: 0, nextDueAt };

    if (frames > maxCatchupFrames) {
        // Too far behind to make up without a burst: drop the gap and restart the clock.
        frames = maxCatchupFrames;
        nextDueAt = now;
    }
    return { frames, nextDueAt: nextDueAt + frames * intervalMs };
}
