import Groq from "groq-sdk";
import type { GithubRepoData } from "@/src/GithubScrape";

// Initialize the standalone Groq client context wrapper
const groq = new Groq();

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

function buildSystemPrompt(
    targetRole?: string,
    resumeText?: string,
    githubUsername?: string,
    githubRepos?: GithubRepoData[]
): string {
    let contextBlocks = [];

    if (targetRole) {
        contextBlocks.push(`TARGET ROLE FOR THIS INTERVIEW: ${targetRole.toUpperCase()}`);
    }

    if (resumeText && resumeText.trim().length > 0) {
        contextBlocks.push(`CANDIDATE RESUME SUMMARY:\n${resumeText.slice(0, 3000)}`);
    }

    if (githubUsername && githubRepos && githubRepos.length > 0) {
        const repoSummaries = githubRepos.map(r => {
            const preview = r.codebase.slice(0, 800).replace(/\n+/g, " ").trim();
            return `Repo: ${r.repo}\nContent preview: ${preview}`;
        }).join("\n\n");

        contextBlocks.push(`CANDIDATE GITHUB PROFILE (@${githubUsername}):\n${repoSummaries}`);
    }

    const contextSection = contextBlocks.length > 0 
        ? `\n\nCANDIDATE & INTERVIEW CONTEXT (INTERNAL ANALYSIS ONLY - DO NOT READ ALOUD):\n${contextBlocks.join("\n\n")}\n\nINTERNAL ANALYSIS RULES:
- Tailor all questions to the candidate's target role (${targetRole || "Software Engineer"}).
- If resume content is provided, ask specific questions about their claimed projects, tools, and background experience from their resume.
- Use GitHub repo data to inform your questions about their actual code patterns and tech stack.
- Do NOT read out raw repo names or say "I read your resume". Integrate the knowledge naturally into your questions as an interviewer.`
        : "";

    return `You are a Senior Principal Staff Engineer conducting a technical voice interview. Be professional, concise, and authoritative. Speak in plain, natural sentences only. Do NOT use any markdown formatting — this is a voice interview.${contextSection}

INTERVIEW FLOW (follow this order strictly):
1. SELF-INTRODUCTION: Start by introducing yourself and mentioning the target role (${targetRole || "Software Engineer"}). Example: "Hello! Welcome to your technical interview for the ${targetRole || "Software Engineer"} position. I'll be evaluating your background and problem-solving skills today. To start off, please tell me a bit about yourself."
2. CANDIDATE INTRODUCTION: Let the candidate introduce themselves. Ask 1-2 questions tailored to their resume or background.
3. TECHNICAL EXPLORATION: Ask 2-3 technical questions aligned with the ${targetRole || "Software Engineer"} role and their tech stack.
4. CODING CHALLENGE: Transition to a coding problem suitable for a ${targetRole || "Software Engineer"}.
5. WRAP UP: Close the interview.

GENERAL CONDUCT:
- Ask questions ONE AT A TIME. Wait for full response.
- Do not teach or explain. Keep follow-ups sharp and evaluative.
- Speak naturally — no lists, no bullet points, no markdown.

WHEN OPENING THE CODE EDITOR:
- When transitioning to a coding problem, say: "Feel free to use any language you are comfortable with — JavaScript, Python, TypeScript, C++, or Java. Let's start coding."
- EXACTLY ONCE per coding problem, embed: [SHOW_EDITOR:python|javascript|cpp|java|typescript]
  Place the tag immediately BEFORE the full problem statement.
- STOP TALKING once editor opens.

AFTER CODE SUBMISSION:
- When candidate submits code, ask a sharp evaluative follow-up on complexity or logic.
- Keep it to 1-2 sentences. End with [HIDE_EDITOR] when finished.

REPEAT REQUESTS:
- If asked to repeat: ONLY repeat the problem statement, and mention it's visible at the top of the code editor.

EDITOR CLOSE:
- [HIDE_EDITOR] is a silent UI command. Say "Alright, let's move on." and include [HIDE_EDITOR].`;
}

// Maintain a modular, rolling conversation trace log locally inside the engine module
let conversationHistory: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() }
];

/**
 * Call this before starting an interview session to inject the candidate's
 * target role, resume data, and GitHub profile data into the system prompt.
 */
export function setInterviewContext(
    targetRole?: string,
    resumeText?: string,
    githubUsername?: string,
    githubRepos?: GithubRepoData[]
): void {
    console.log(`[LLM] Setting interview context for Role: "${targetRole}", Resume: ${!!resumeText}, GitHub: @${githubUsername}`);
    conversationHistory = [
        { role: "system", content: buildSystemPrompt(targetRole, resumeText, githubUsername, githubRepos) }
    ];
}

/**
 * Legacy wrapper for setting GitHub context alone.
 */
export function setGithubContext(githubUsername: string, githubRepos: GithubRepoData[]): void {
    setInterviewContext(undefined, undefined, githubUsername, githubRepos);
}

/**
 * Reset conversation history (call between sessions or on new interview).
 */
export function resetConversation(): void {
    conversationHistory = [
        { role: "system", content: buildSystemPrompt() }
    ];
}


interface StreamCallbacks {
    onToken: (t: string) => void;
    onComplete: (fullText: string) => void;
    onError: (err: any) => void;
    onEditorTrigger?: (language: string, questionText: string) => void;
    onHideEditorTrigger?: () => void;
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
        let triggeredEditor = false;
        let triggeredHideEditor = false;
        // Rolling buffer: holds text that MIGHT contain a partial tag
        // Only safe (non-tag) content is flushed to TTS
        let ttsBuffer = "";
        // Max length of any tag we need to suppress: [SHOW_EDITOR:typescript] = 26 chars
        const MAX_TAG_LENGTH = 30;

        const flushSafeTtsContent = () => {
            // Strip control tags and markdown formatting before sending to TTS voice
            const stripForVoice = (text: string) => text
                .replace(/\[SHOW_EDITOR:[^\]]+\]/gi, "")
                .replace(/\[HIDE_EDITOR\]/gi, "")
                // Strip markdown: bold/italic asterisks and underscores
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/\*([^*]+)\*/g, "$1")
                .replace(/__([^_]+)__/g, "$1")
                .replace(/_([^_]+)_/g, "$1")
                // Strip inline code backticks
                .replace(/`([^`]+)`/g, "$1")
                // Strip heading hashes
                .replace(/^#{1,6}\s+/gm, "")
                // Strip bullet dashes/asterisks at line start
                .replace(/^[-*]\s+/gm, "");

            ttsBuffer = stripForVoice(ttsBuffer);

            // Find the last '[' — everything before it is safe to send to TTS
            const lastBracket = ttsBuffer.lastIndexOf("[");
            if (lastBracket === -1) {
                // No brackets at all — flush everything
                if (ttsBuffer) {
                    callbacks.onToken(ttsBuffer);
                    ttsBuffer = "";
                }
            } else {
                // Flush everything before the last '['
                const safe = ttsBuffer.substring(0, lastBracket);
                if (safe) callbacks.onToken(safe);
                ttsBuffer = ttsBuffer.substring(lastBracket);
                // If the buffered '[...' section is longer than any possible tag,
                // it can't be a tag — flush it too
                if (ttsBuffer.length > MAX_TAG_LENGTH) {
                    callbacks.onToken(ttsBuffer);
                    ttsBuffer = "";
                }
            }
        };

        // 3. Consume token packages over the network wire loops
        for await (const chunk of responseStream) {
            // Check for instant cancellation mid-loop cycles manually
            if (signal.aborted) {
                throw new Error("AbortError");
            }

            const textChunk = chunk.choices?.[0]?.delta?.content || "";
            if (textChunk) {
                accumulatedResponse += textChunk;

                // Check triggers on accumulated (complete) text only
                if (accumulatedResponse.includes("[HIDE_EDITOR]") && !triggeredHideEditor) {
                    triggeredHideEditor = true;
                    if (callbacks.onHideEditorTrigger) {
                        callbacks.onHideEditorTrigger();
                    }
                }

                // Add chunk to rolling buffer, then flush safe content
                ttsBuffer += textChunk;
                flushSafeTtsContent();
            }
        }

        // Flush any remaining buffered content (strip tags + markdown)
        ttsBuffer = ttsBuffer
            .replace(/\[SHOW_EDITOR:[^\]]+\]/gi, "")
            .replace(/\[HIDE_EDITOR\]/gi, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/__([^_]+)__/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/^[-*]\s+/gm, "");
        if (ttsBuffer) {
            callbacks.onToken(ttsBuffer);
            ttsBuffer = "";
        }


        // 4. Now that the full response is accumulated, extract the editor trigger with complete question text
        if (!triggeredEditor) {
            const editorMatch = accumulatedResponse.match(/\[SHOW_EDITOR:(javascript|python|cpp|java|typescript)\]/i);
            if (editorMatch && callbacks.onEditorTrigger) {
                triggeredEditor = true;
                const lang = (editorMatch[1] ?? "javascript").toLowerCase();
                const matchedTag = editorMatch[0] ?? "";
                // Extract everything after the tag as the question text
                const afterTagIndex = accumulatedResponse.indexOf(matchedTag) + matchedTag.length;
                const questionText = accumulatedResponse.substring(afterTagIndex).trim();
                callbacks.onEditorTrigger(lang, questionText);
            }
        }

        // 5. Commit fully completed output sequences into tracing logs
        const cleanedResponse = accumulatedResponse.replace(/\[SHOW_EDITOR:[^\]]+\]/gi, "").replace(/\[HIDE_EDITOR\]/gi, "");
        conversationHistory.push({ role: "assistant", content: cleanedResponse });
        callbacks.onComplete(accumulatedResponse);
        console.log("[LLM Full Response]:", accumulatedResponse);


    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'AbortError' || signal.aborted) {
            // Log local telemetry actions inside module scope gracefully
            console.log("\n✅ [LLM Engine]: Successfully halted streaming generator pipelines cleanly.");
        } else {
            callbacks.onError(error);
        }
    }
}
