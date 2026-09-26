import { config } from "../config/env";

/**
 * Deliberate audio trouble, for testing how the voice holds up on a bad connection or a busy server.
 * Off unless one of these variables is set, and refused in production, so it can never affect real users.
 *
 *   AUDIO_TEST_TTS_STALL_EVERY=25  AUDIO_TEST_TTS_STALL_MS=600   speech audio arrives late in bursts
 *   AUDIO_TEST_TTS_RATE=0.6                                      speech audio arrives at 0.6x real time (a slow provider)
 *   AUDIO_TEST_NO_FEC=1                                          turn off the voice's loss protection, to measure what it buys
 *   AUDIO_TEST_LOSS_PERCENT=5                                    that share of outgoing voice packets is dropped
 *   AUDIO_TEST_BLOCK_MS=60         AUDIO_TEST_BLOCK_EVERY_MS=400 the event loop is blocked for a while, regularly
 */
function number(name: string): number {
    const value = Number(process.env[name] ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export const audioFaults = config.isProduction
    ? { ttsStallEvery: 0, ttsStallMs: 0, ttsRate: 0, noFec: false, lossPercent: 0, blockMs: 0, blockEveryMs: 0, active: false }
    : (() => {
          const faults = {
              ttsStallEvery: number("AUDIO_TEST_TTS_STALL_EVERY"),
              ttsStallMs: number("AUDIO_TEST_TTS_STALL_MS"),
              ttsRate: number("AUDIO_TEST_TTS_RATE"),
              noFec: process.env.AUDIO_TEST_NO_FEC === "1",
              lossPercent: number("AUDIO_TEST_LOSS_PERCENT"),
              blockMs: number("AUDIO_TEST_BLOCK_MS"),
              blockEveryMs: number("AUDIO_TEST_BLOCK_EVERY_MS") || 500,
          };
          return { ...faults, active: Boolean(faults.ttsStallMs || faults.ttsRate || faults.lossPercent || faults.blockMs || faults.noFec) };
      })();

let blocker: NodeJS.Timeout | null = null;

/** Starts blocking the event loop on purpose, if asked to. */
export function startLoopBlocker(): void {
    if (!audioFaults.blockMs || blocker) return;
    blocker = setInterval(() => {
        const until = Date.now() + audioFaults.blockMs;
        while (Date.now() < until) { /* hold the event loop */ }
    }, audioFaults.blockEveryMs);
    blocker.unref();
}
