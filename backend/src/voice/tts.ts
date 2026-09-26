import { DeepgramClient, SpeakV1SampleRate } from "@deepgram/sdk";
import { config } from "../config/env";

/** Opens a streaming text-to-speech connection producing 48 kHz mono 16-bit PCM in the chosen voice. */
export async function connectTts(voice: string) {
    if (!config.deepgramApiKey) throw new Error("DEEPGRAM_API_KEY is not set.");
    const deepgram = new DeepgramClient({ apiKey: config.deepgramApiKey });

    const connection = await deepgram.speak.v1.connect({
        Authorization: config.deepgramApiKey,
        model: voice as never,
        encoding: "linear16",
        sample_rate: SpeakV1SampleRate.FortyEightThousand,
    });

    connection.connect();
    await connection.waitForOpen();
    return connection;
}

export type TtsConnection = Awaited<ReturnType<typeof connectTts>>;

// ---------------------------------------------------------------------------------------- voice preview

/** What the preview says. Fixed, so each voice is synthesised once per process and then served from memory. */
export const SAMPLE_TEXT = "Hi, I'm your interviewer for today. If you can hear me clearly, you're all set. Let's get started whenever you're ready.";

type Synthesizer = (voice: string, text: string) => Promise<Buffer>;

async function synthesizeWithDeepgram(voice: string, text: string): Promise<Buffer> {
    if (!config.deepgramApiKey) throw new Error("DEEPGRAM_API_KEY is not set.");
    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=mp3&bit_rate=48000`, {
        method: "POST",
        headers: { Authorization: `Token ${config.deepgramApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Speech synthesis answered ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

let synthesizer: Synthesizer = synthesizeWithDeepgram;
const sampleCache = new Map<string, Promise<Buffer>>();

/** Tests substitute the synthesiser so no speech service is called. */
export function setSampleSynthesizerForTesting(replacement: Synthesizer | null): void {
    synthesizer = replacement ?? synthesizeWithDeepgram;
    sampleCache.clear();
}

/** A short spoken sample of an interviewer voice (MP3), so a candidate can check their speakers before the interview. */
export function voiceSample(voice: string): Promise<Buffer> {
    let pending = sampleCache.get(voice);
    if (!pending) {
        pending = synthesizer(voice, SAMPLE_TEXT).catch((error) => {
            sampleCache.delete(voice); // a failure is not remembered
            throw error;
        });
        sampleCache.set(voice, pending);
    }
    return pending;
}
