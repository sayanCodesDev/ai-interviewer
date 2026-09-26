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
