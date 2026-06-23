import { DeepgramClient } from "@deepgram/sdk";
import "dotenv/config"

export async function STT() {
    const deepgram = new DeepgramClient({
        apiKey: process.env.DEEPGRAM_API_KEY!,
    });

    const dgConnection = await deepgram.listen.v1.connect({
        Authorization: "process.env.DEEPGRAM_API_KEY!",
        model: "nova-3",
        language: "en",
        interim_results: "true",
        punctuate: "true",
        encoding: "opus",
        sample_rate: "48000",
        channels: "1",
    });

    dgConnection.on("open", () => {
        console.log("Deepgram connected");
    });

    dgConnection.on("close", () => {
        console.log("Deepgram disconnected");
    });

    dgConnection.on("error", (err) => {
        console.error(err);
    });

    dgConnection.on("message", (data) => {
        if (data.type === "Results") {
            console.log(data);
        }
    });

    dgConnection.connect();
    await dgConnection.waitForOpen();

    // if (dgConnection) {
    //     dgConnection.on("message", (response: any) => {
    //         try {
    //             const transcript = response.channel?.alternatives?.[0]?.transcript;

    //             // ONLY print if there is text AND Deepgram flags that you have stopped/paused speaking
    //             if (transcript && transcript.trim().length > 0 && response.is_final) {
    //                 console.log(`[SPEECH COMPLETED]: ${transcript.trim()}`);
    //             }
    //         } catch (err) {
    //             console.error("Error processing Deepgram message:", err);
    //         }
    //     });

    //     dgConnection.on("error", (err: any) => {
    //         console.error("Deepgram Stream Error:", err);
    //     });
    // }

    return dgConnection;
}
