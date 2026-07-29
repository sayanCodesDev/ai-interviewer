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
    githubUsername?: string,
    githubRepos?: GithubRepoData[]
): string {
    let contextBlocks = [];

    if (targetRole) {
        contextBlocks.push(`TARGET ROLE FOR THIS INTERVIEW: ${targetRole.toUpperCase()}`);
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
- Use GitHub repo data to inform your questions about their actual code patterns and tech stack.
- Do NOT read out raw repo names. Integrate the knowledge naturally into your questions as an interviewer.`
        : "";

    return `You are a Senior Principal Staff Engineer conducting a technical voice interview. Be professional, concise, and authoritative. Speak in plain, natural sentences only. Do NOT use any markdown formatting — this is a voice interview.${contextSection}

INTERVIEW FLOW (follow this order strictly):
1. SELF-INTRODUCTION: Start by introducing yourself and mentioning the target role (${targetRole || "Software Engineer"}). Example: "Hello! Welcome to your technical interview for the ${targetRole || "Software Engineer"} position. I'll be evaluating your problem-solving skills today. To start off, please introduce yourself briefly."
2. BRIEF INTRODUCTION & INTERESTS: Ask 1 quick question about their technical background or interests, then IMMEDIATELY transition to the DSA Coding Round.
3. DSA CODING ROUND (MAIN FOCUS - 5 TO 6 QUESTIONS TOTAL):
   - Target 5 to 6 DSA problems in total. For each problem, follow these exact steps:

   STEP A — OPEN EDITOR & PRESENT PROBLEM:
   - Embed [SHOW_EDITOR:language] immediately before the problem statement in the same response.
   - Example: "[SHOW_EDITOR:javascript]Given an array of integers, return the indices of the two numbers that add up to a target." 
   - FIRST problem only: say "Feel free to select your preferred language at the top of the editor." before the tag. Subsequent problems: skip this phrase.
   - Stop after the problem statement. Wait for the candidate to submit their code.

   STEP B — EVALUATE THE SUBMITTED CODE (immediately after submission):
   - Briefly assess the submitted code for correctness and edge cases in 1-2 sentences.
   - DO NOT emit [HIDE_EDITOR] yet. The editor must stay open during all follow-up questions.
   - If code is CORRECT: Say "Your solution looks good. Now, what is the time complexity of your approach?"
   - If code has BUGS / is WRONG: Point out the issue and say "Can you reconsider and try again?" Wait for their voice response. If they still cannot fix it, briefly explain the correct solution, then continue to follow-up questions.

   STEP C — FOLLOW-UP QUESTIONS (ask ONE at a time, wait for answer each time):
   - Question 1: "What is the time complexity of your solution?" — Wait for answer.
     - If CORRECT: Confirm and proceed. If WRONG or no answer: briefly explain the correct Big-O, then proceed.
   - Question 2: "And what about the space complexity?" — Wait for answer.
     - If CORRECT: Confirm and proceed. If WRONG or no answer: briefly explain, then proceed.
   - Question 3: "Walk me through your thought process. Is there a more optimal approach?" — Wait for answer.
     - Evaluate their answer. If they miss something, clarify it briefly.

   STEP D — CLOSE EDITOR & TRANSITION TO NEXT PROBLEM:
   - ONLY AFTER completing all 3 follow-up questions, share 1 sentence of your expert insight on this problem.
   - Say "Alright, let's move on to the next problem." 
   - Emit [HIDE_EDITOR] in this same response to close the workspace.
   - Immediately in the NEXT response (when candidate acknowledges or stays silent), open a new editor with the next DSA problem.

4. WRAP UP (AFTER 5-6 DSA QUESTIONS):
   - Provide warm, constructive feedback and advice on overall performance.
   - Thank the candidate and wish them the best of luck. Conclude the interview warmly.

GENERAL CONDUCT:
- Ask EXACTLY ONE question at a time. Always wait for the full response before asking the next.
- Speak naturally. No lists, no bullet points, no markdown formatting (this is a voice interview).

WHEN OPENING THE CODE EDITOR:
- DSA problems ONLY (arrays, strings, binary trees, dynamic programming, two pointers, sliding window, graphs, stacks, queues). Never open the editor for system design or non-DSA questions.
- CRITICAL FORMAT RULE: You MUST embed the [SHOW_EDITOR:language] tag IMMEDIATELY BEFORE the problem statement text in the same response.
  CORRECT: "[SHOW_EDITOR:javascript]Given an array of integers nums and a target sum, return the indices of the two numbers that add up to the target."
  WRONG: "Here is a problem: Two Sum. [SHOW_EDITOR:javascript]" — WRONG because problem text comes BEFORE the tag.
- After the problem statement, do NOT add any more text.

REPEAT REQUESTS:
- If asked to repeat the problem: ONLY repeat the problem statement and mention it is visible at the top of the code editor.

EDITOR CLOSE:
- [HIDE_EDITOR] is a silent UI command. ONLY emit [HIDE_EDITOR] in STEP D, after ALL follow-up questions are complete. Never emit it during code evaluation or follow-up Q&A.`;
}

// Maintain a modular, rolling conversation trace log locally inside the engine module
let conversationHistory: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() }
];

/**
 * Call this before starting an interview session to inject the candidate's
 * target role and GitHub profile data into the system prompt.
 */
export function setInterviewContext(
    targetRole?: string,
    githubUsername?: string,
    githubRepos?: GithubRepoData[]
): void {
    console.log(`[LLM] Setting interview context for Role: "${targetRole}", GitHub: @${githubUsername}`);
    conversationHistory = [
        { role: "system", content: buildSystemPrompt(targetRole, githubUsername, githubRepos) }
    ];
}

/**
 * Legacy wrapper for setting GitHub context alone.
 */
export function setGithubContext(githubUsername: string, githubRepos: GithubRepoData[]): void {
    setInterviewContext(undefined, githubUsername, githubRepos);
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
                const tagIndex = accumulatedResponse.indexOf(matchedTag);

                // Primary: extract problem statement AFTER the tag
                let questionText = accumulatedResponse.substring(tagIndex + matchedTag.length).trim();

                // Fallback: if nothing (or very little) follows the tag, extract the text BEFORE the tag
                // This handles the case where the LLM speaks the problem first, then ends with the tag
                if (questionText.length < 20) {
                    const textBeforeTag = accumulatedResponse.substring(0, tagIndex).trim();
                    // Strip any opening phrases like "Here's your first problem." from the start
                    const cleanedBefore = textBeforeTag
                        .replace(/^(alright[,.]?|okay[,.]?|let's (start|begin|move)[^.]*\.|feel free[^.]*\.?|here('s| is) (your )?(first |next |a )?(dsa |coding )?problem[^.]*\.?)/i, "")
                        .trim();
                    if (cleanedBefore.length > 20) {
                        questionText = cleanedBefore;
                    }
                }

                // Strip any residual control tags from the question text
                questionText = questionText
                    .replace(/\[SHOW_EDITOR:[^\]]+\]/gi, "")
                    .replace(/\[HIDE_EDITOR\]/gi, "")
                    .trim();

                console.log("[Editor Trigger] lang:", lang, "| questionText (first 100):", questionText.substring(0, 100));
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
