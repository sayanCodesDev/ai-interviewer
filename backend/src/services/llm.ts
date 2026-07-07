import Groq from "groq-sdk";
// import { prisma } from "@/lib/prisma";

// Initialize the standalone Groq client context wrapper
const groq = new Groq();

// Maintain a modular, rolling conversation trace log locally inside the engine module
const conversationHistory: { role: 'system' | 'user' | 'assistant', content: string }[] = [
    {
        role: "system",
        content: "You are an elite technical interviewer. Conduct a structured coding and system design interview. Be concise, engaging, professional, and ask only one follow-up question at a time. Wait for the candidate to fully finish their thought. first ask wha tis his name and call by his his or her name if need de also ask what role u want to go with first and lets have only short question answer interview and dont ask too many questions at once "
    }
];

interface StreamCallbacks {
    onToken: (t: string) => void;
    onComplete: (fullText: string) => void;
    onError: (err: any) => void;
}

/**
 * Handles the complete multi-turn conversational loop, token streaming, 
 * and explicit interruption interception using native abort tokens.
 */
export async function LLM(
    userAnswer: string,
    signal: AbortSignal,
    callbacks: StreamCallbacks
) {
    try {
        // 1. Commit candidate answers into history array bounds
        conversationHistory.push({ role: "user", content: userAnswer });

        // 2. Initialise network request targeting the active high-speed versatile model
        const responseStream = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: conversationHistory,
            stream: true,
            temperature: 0.7,
        }, {
            signal: signal
        });

        let accumulatedResponse = "";

        // 3. Consume token packages over the network wire loops
        for await (const chunk of responseStream) {
            // Check for instant cancellation mid-loop cycles manually
            if (signal.aborted) {
                throw new Error("AbortError");
            }

            const textChunk = chunk.choices?.[0]?.delta?.content || "";
            if (textChunk) {
                accumulatedResponse += textChunk;
                callbacks.onToken(textChunk); // Pipe real-time fragment tokens immediately to listener
            }
        }

        // 4. Commit fully completed output sequences into tracing logs
        conversationHistory.push({ role: "assistant", content: accumulatedResponse });
        callbacks.onComplete(accumulatedResponse);
        console.log(conversationHistory)
    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'AbortError' || signal.aborted) {
            // Log local telemetry actions inside module scope gracefully
            console.log("\n✅ [LLM Engine]: Successfully halted streaming generator pipelines cleanly.");
        } else {
            callbacks.onError(error);
        }
    }
}
