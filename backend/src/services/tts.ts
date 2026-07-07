import { DeepgramClient, SpeakV1SampleRate } from "@deepgram/sdk";

export async function TTS() {

    const deepgram = new DeepgramClient({
        apiKey: process.env.DEEPGRAM_API_KEY!,
    });

    const dgTtsConnection = await deepgram.speak.v1.connect({
        Authorization: process.env.DEEPGRAM_API_KEY!,
        model: "aura-2-thalia-en",
        encoding: "linear16",
        sample_rate: SpeakV1SampleRate.FortyEightThousand,
    });

    dgTtsConnection.on("open", () => {
        console.log("Deepgram TTS connected");
    });

    dgTtsConnection.on("close", () => {
        console.log("Deepgram TTS disconnected");
    });

    dgTtsConnection.on("error", (err) => {
        console.error(err);
    });

    dgTtsConnection.connect();
    await dgTtsConnection.waitForOpen()

    return dgTtsConnection;
}