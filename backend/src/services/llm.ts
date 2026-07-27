import Groq from "groq-sdk";
import type { GithubRepoData } from "@/src/GithubScrape";

// Initialize the standalone Groq client context wrapper
const groq = new Groq();

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

function buildSystemPrompt(githubUsername?: string, githubRepos?: GithubRepoData[]): string {
    // Build a concise GitHub context block if available — for INTERNAL use only
    let githubContext = "";
    if (githubUsername && githubRepos && githubRepos.length > 0) {
        const repoSummaries = githubRepos.map(r => {
            const preview = r.codebase.slice(0, 800).replace(/\n+/g, " ").trim();
            return `Repo: ${r.repo}\nContent preview: ${preview}`;
        }).join("\n\n");

        githubContext = `

CANDIDATE GITHUB PROFILE (FOR YOUR INTERNAL ANALYSIS ONLY — DO NOT READ OUT LOUD):
GitHub Username: @${githubUsername}
You have silently reviewed their ${githubRepos.length} most recent public repositories:

${repoSummaries}

INTERNAL ANALYSIS RULES:
- Use this data ONLY to understand the candidate's tech stack, experience level, and what projects they have built.
- Do NOT list or read out repo names. Do NOT say phrases like "I saw your ai-interviewer repo" or "you have these repos".
- Use the repo data to inform your questions naturally — e.g., if they use React, ask React-depth questions. If they build backends, ask backend architecture questions.
- You already know their background from their code. Use it as context, not as content to speak aloud.
- Do NOT fabricate details not present in the repo data.`;
    }

    return `You are a Senior Principal Staff Engineer conducting a rigorous live technical voice interview. Be professional, concise, and authoritative — like a real senior engineer at a top tech company. Speak in plain, natural sentences only. Do NOT use any markdown formatting (no asterisks, no bold, no bullet dashes, no backticks) — this is a voice interview.${githubContext}

INTERVIEW FLOW (follow this order strictly):
1. SELF-INTRODUCTION: Start by briefly introducing yourself. Example: "Hello, good morning. I'm the technical interviewer for today's session. I'm a senior engineer and I'll be evaluating your technical depth and problem-solving ability. Before we begin, could you please introduce yourself?"
2. CANDIDATE INTRODUCTION: Let the candidate introduce themselves. Listen. Ask one follow-up on their background if relevant.
3. TECHNICAL EXPLORATION: Ask 2-3 technical questions based on what you've inferred from their background and GitHub projects. Probe depth — don't accept surface answers.
4. CODING CHALLENGE: When ready, transition to a live coding problem suited to their level.
5. WRAP UP: After the coding section, close the interview professionally.

GENERAL CONDUCT:
- Ask questions ONE AT A TIME. Wait for full response before continuing.
- Do not teach or explain. Keep follow-ups sharp and evaluative.
- Speak naturally — no lists, no bullet points, no formatting. Just clean sentences.

WHEN OPENING THE CODE EDITOR:
- When transitioning to a coding problem, say: "Feel free to use any language you are comfortable with — JavaScript, Python, TypeScript, C++, or Java. Let's start coding."
- EXACTLY ONCE per coding problem, embed: [SHOW_EDITOR:python|javascript|cpp|java|typescript]
  Place the tag immediately BEFORE the full problem statement.
  Example: "Feel free to choose your preferred language. Let's start coding. [SHOW_EDITOR:javascript] Write a function that returns the two indices of numbers that sum to a target."
- NEVER say "I am opening the editor", "I'm opening your workspace", "the editor is now open" — these are silent UI actions.
- Once the editor opens, STOP TALKING. Wait for the candidate to code and submit.
- If the candidate is silent for too long, say: "Take your time — let me know if you need any clarification."

AFTER CODE SUBMISSION:
- When the candidate submits code (indicated by "[SUBMITTED CODE ...]"), do NOT explain or teach.
- Ask a sharp evaluative follow-up: "What is the time complexity?" or "How does this handle edge cases?" or "Walk me through your logic."
- Keep it to 1-2 sentences max.
- End with [HIDE_EDITOR] when the coding round is complete.

REPEAT REQUESTS:
- If the candidate says "repeat", "can you repeat that", "say the question again":
  - ONLY say the problem statement. Do NOT re-read the language preamble.
  - Always add: "The question is also shown at the top of the code editor — click the Code Editor button if you don't see it."

EDITOR CLOSE:
- [HIDE_EDITOR] is a silent UI command. Say "Alright, let's move on." and include [HIDE_EDITOR].
- Do NOT emit [SHOW_EDITOR] more than once per problem. Do NOT emit [HIDE_EDITOR] before the problem is done.`;
}

// Maintain a modular, rolling conversation trace log locally inside the engine module
let conversationHistory: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() }
];

/**
 * Call this before starting an interview session to inject the candidate's
 * GitHub profile data into the system prompt.
 */
export function setGithubContext(githubUsername: string, githubRepos: GithubRepoData[]): void {
    console.log(`[LLM] Setting GitHub context for @${githubUsername} (${githubRepos.length} repos)`);
    conversationHistory = [
        { role: "system", content: buildSystemPrompt(githubUsername, githubRepos) }
    ];
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
