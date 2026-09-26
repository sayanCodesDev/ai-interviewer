import { DeepgramClient } from "@deepgram/sdk";
import { config } from "../config/env";

export interface SttOptions {
    /** Deepgram language code: en, en-US, en-GB, en-IN, en-AU. */
    accent: string;
    /** Vocabulary the recogniser should favour: the tools and acronyms of this interview. */
    keyterms: string[];
}

const KEEP_ALIVE_MS = 5_000;

/** Terms go into the connection URL, so keep them short, printable and few. */
export function cleanKeyterms(terms: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of terms) {
        const term = raw.replace(/[^\p{L}\p{N} .+#/&-]/gu, "").trim().slice(0, 40);
        if (term.length < 2 || seen.has(term.toLowerCase())) continue;
        seen.add(term.toLowerCase());
        out.push(term);
        if (out.length >= 40) break;
    }
    return out;
}

/**
 * Opens a streaming transcription connection.
 * - smart_format/numerals give readable text ("O(n log n)", "3 million") for captions and the transcript.
 * - keyterm biases recognition toward this interview's vocabulary, so "Kubernetes" isn't heard as "cuban eighties".
 * - endpointing/utterance_end_ms/vad_events let the turn-taker react to real pauses instead of guessing.
 */
export async function connectStt(options: SttOptions) {
    if (!config.deepgramApiKey) throw new Error("DEEPGRAM_API_KEY is not set.");
    const deepgram = new DeepgramClient({ apiKey: config.deepgramApiKey });

    const connection = await deepgram.listen.v1.connect({
        Authorization: config.deepgramApiKey,
        model: "nova-3",
        language: options.accent as never,
        interim_results: "true",
        punctuate: "true",
        smart_format: "true",
        numerals: "true",
        endpointing: 350 as never,
        utterance_end_ms: 1000 as never,
        vad_events: "true",
        encoding: "opus",
        sample_rate: "48000",
        channels: "1",
        ...(cleanKeyterms(options.keyterms).length > 0 ? { keyterm: cleanKeyterms(options.keyterms) as never } : {}),
    });

    connection.connect();
    await connection.waitForOpen();

    // Deepgram closes a connection that goes quiet. Silence (a muted mic) is still audio, but be safe.
    const keepAlive = setInterval(() => {
        try {
            if (connection.readyState === 1) connection.socket.send(JSON.stringify({ type: "KeepAlive" }));
        } catch {
            /* the close handler deals with it */
        }
    }, KEEP_ALIVE_MS);
    keepAlive.unref();
    connection.on("close", () => clearInterval(keepAlive));

    return connection;
}

export type SttConnection = Awaited<ReturnType<typeof connectStt>>;
