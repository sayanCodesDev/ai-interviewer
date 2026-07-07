import { DeepgramClient } from "@deepgram/sdk";
import "dotenv/config"

export async function STT() {
    const deepgram = new DeepgramClient({
        apiKey: process.env.DEEPGRAM_API_KEY!,
    });

    const dgConnection = await deepgram.listen.v1.connect({
        Authorization: process.env.DEEPGRAM_API_KEY!,
        model: "nova-3",
        language: "en",
        interim_results: "true",
        punctuate: "true",
        encoding: "opus",
        sample_rate: "48000",
        channels: "1",
    });

    dgConnection.on("open", () => {
        console.log("Deepgram STT connected");
    });

    dgConnection.on("close", () => {
        console.log("Deepgram STT disconnected");
    });

    dgConnection.on("error", (err) => {
        console.error(err);
    });

    dgConnection.connect();
    await dgConnection.waitForOpen();

    return dgConnection;
}
