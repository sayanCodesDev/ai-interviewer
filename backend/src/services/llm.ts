import "dotenv/config";
import Groq from "groq-sdk";
import type { GithubRepoData } from "@/src/GithubScrape";

// Created on first use, not at import: a missing key must not stop the server from
// booting (or the test suite from running) with an opaque constructor throw.
let groqClient: Groq | null = null;

function getGroq(): Groq {
    if (!groqClient) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is not set — set it in backend/.env before starting an interview.");
        }
        groqClient = new Groq();
    }
    return groqClient;
}

// Must be a model this Groq key can actually reach — `GET /openai/v1/models`
// lists them. A wrong id only surfaces as a 404 mid-interview, which reads as the
// interviewer going silent, so verifyModelAvailable() checks it at boot.
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

/**
 * Warns at startup if the configured model is not available to this API key.
 * Never throws: a transient Groq outage must not stop the server from booting.
 */
export async function verifyModelAvailable(): Promise<void> {
    try {
        const { data } = await getGroq().models.list();
        const available = (data ?? []).map((m) => m.id);
        if (!available.includes(GROQ_MODEL)) {
            console.error(
                `[LLM] GROQ_MODEL "${GROQ_MODEL}" is not available to this API key. ` +
                `Interviews will fail with a 404. Available models: ${available.join(", ")}`
            );
            return;
        }
        console.log(`[LLM] Using Groq model "${GROQ_MODEL}".`);
    } catch (err: any) {
        console.warn(`[LLM] Could not verify the Groq model list: ${err.message}`);
    }
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** Control tags are UI commands: never spoken, never shown to the candidate. */
function stripControlTags(text: string): string {
    return text
        .replace(/\[SHOW_EDITOR:[^\]]+\]/gi, "")
        .replace(/\[HIDE_EDITOR\]/gi, "");
}

/** The interview is spoken aloud, so markdown must reach neither TTS nor the question banner. */
function stripMarkdown(text: string): string {
    return text
        // Bold/italic asterisks and underscores
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        // Inline code backticks
        .replace(/`([^`]+)`/g, "$1")
        // Heading hashes
        .replace(/^#{1,6}\s+/gm, "")
        // Bullet dashes/asterisks at line start
        .replace(/^[-*]\s+/gm, "");
}

// Shortest text we will accept as a problem statement.
const MIN_PROBLEM_LENGTH = 20;

// Sentences an interviewer says *around* a problem, which are not part of it.
// Each pattern is deliberately narrow — it demands wording a real problem
// statement would never open with — so a genuine "Write a function that..." or
// "In this problem, you are given..." is never eaten.
const CONVERSATIONAL_OPENERS: RegExp[] = [
    /^(?:alright|all right|okay|ok|great|perfect|excellent|sure|good)\b[,.!?:;—-]*\s*/i,
    /^(?:welcome|hello|hi there|hi)\b[^.!?]*[.!?]+\s*/i,
    /^let'?s\s+(?:start|begin|move|dive|jump|get|turn|try)\b[^.!?]*[.!?]+\s*/i,
    /^(?:here(?:'s| is)|this is)\s+(?:your|the|a|another)\b[^.!?]*?\b(?:problem|question|challenge|one)\b[^.!?]*[.!?]+\s*/i,
    /^feel free\b[^.!?]*[.!?]+\s*/i,
    /^i(?:'ll|'m| will| am)\s+(?:going to\s+)?(?:present|give|ask|start|begin|share)\b[^.!?]*[.!?]+\s*/i,
    /^(?:please\s+)?(?:write|submit|code)\s+your\s+(?:solution|code|answer)\b[^.!?]*[.!?]+\s*/i,
    /^(?:feel free to\s+)?(?:select|choose|pick)\s+your\s+(?:preferred\s+)?language\b[^.!?]*[.!?]+\s*/i,
    /^remember\b[^.!?]*[.!?]+\s*/i,
    /^take your time\b[^.!?]*[.!?]+\s*/i,
    /^(?:the\s+)?(?:editor|workspace|code editor)\s+(?:is|will)\b[^.!?]*[.!?]+\s*/i,
];

// Editor/language housekeeping the prompt asks for *before* the tag, which models
// routinely append after the problem instead. Anchored to the end and narrow enough
// that a problem's constraints ("...return -1 otherwise.") are never touched.
const TRAILING_META: RegExp[] = [
    /\s*(?:and\s+)?(?:feel free to\s+)?(?:select|choose|pick)\s+your\s+(?:preferred\s+)?language\b[^.!?]*[.!?]\s*$/i,
    /\s*(?:the\s+)?(?:code\s+)?(?:editor|workspace)\s+(?:is|will be)\b[^.!?]*[.!?]\s*$/i,
    /\s*you can (?:write|type|code|enter)\s+your\s+(?:solution|code|answer)\b[^.!?]*[.!?]\s*$/i,
    /\s*(?:please\s+)?(?:write|submit|code)\s+your\s+(?:solution|code|answer)\s+(?:in|at|using)\b[^.!?]*[.!?]\s*$/i,
    /\s*take your time\b[^.!?]*[.!?]\s*$/i,
    /\s*let me know (?:when|if|once)\b[^.!?]*[.!?]\s*$/i,
];

function stripInterviewerChatter(text: string): string {
    let out = text.trim();
    // Models routinely stack several of these around the actual problem.
    const passes = CONVERSATIONAL_OPENERS.length + TRAILING_META.length;
    for (let pass = 0; pass < passes; pass++) {
        const previous = out;
        for (const pattern of CONVERSATIONAL_OPENERS) {
            out = out.replace(pattern, "").trim();
        }
        for (const pattern of TRAILING_META) {
            out = out.replace(pattern, "").trim();
        }
        if (out === previous) break;
    }
    return out;
}

/**
 * Pulls the problem statement out of a response containing a [SHOW_EDITOR:...] tag.
 *
 * The prompt asks for the tag immediately before the problem, but models place it
 * at the very start of the response just as often and then lead with a greeting.
 * So take whichever side of the tag actually carries the statement, and drop the
 * interviewer's chatter either way. Keeps the editor banner model-agnostic.
 */
export function extractProblemStatement(response: string, tagIndex: number, tagLength: number): string {
    const clean = (part: string) => stripInterviewerChatter(stripMarkdown(stripControlTags(part)));

    const after = clean(response.slice(tagIndex + tagLength));
    if (after.length >= MIN_PROBLEM_LENGTH) return after;

    // The model spoke the problem first and ended on the tag.
    const before = clean(response.slice(0, tagIndex));
    if (before.length >= MIN_PROBLEM_LENGTH) return before;

    // Neither side looks like a statement; show the longer one so the banner is not blank.
    return after.length >= before.length ? after : before;
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
- CRITICAL FORMAT RULE: embed the [SHOW_EDITOR:language] tag IMMEDIATELY BEFORE the problem statement, and put NOTHING after the tag except the problem statement itself. Every greeting, language instruction or lead-in belongs BEFORE the tag.
  CORRECT: "[SHOW_EDITOR:javascript]Given an array of integers nums and a target sum, return the indices of the two numbers that add up to the target."
  CORRECT: "Alright, let's begin. [SHOW_EDITOR:javascript]Given an array of integers nums and a target sum, return the indices of the two numbers that add up to the target."
  WRONG: "Here is a problem: Two Sum. [SHOW_EDITOR:javascript]" — the problem text must come AFTER the tag.
  WRONG: "[SHOW_EDITOR:javascript]Welcome to the coding round. Please write your solution in JavaScript. Here is your first problem. Given an array..." — the greeting and instructions must come BEFORE the tag, not after it.
- After the problem statement, do NOT add any more text.

REPEAT REQUESTS:
- If asked to repeat the problem: ONLY repeat the problem statement and mention it is visible at the top of the code editor.

EDITOR CLOSE:
- [HIDE_EDITOR] is a silent UI command. ONLY emit [HIDE_EDITOR] in STEP D, after ALL follow-up questions are complete. Never emit it during code evaluation or follow-up Q&A.`;
}

/**
 * One candidate's interview. All mutable conversation state lives here rather
 * than in module scope, so concurrent candidates never share a transcript.
 */
export interface InterviewSession {
    userId: string;
    targetRole?: string;
    githubUsername?: string;
    history: ChatMessage[];
    lastActiveAt: number;
}

// Keep the system prompt plus this many recent turns. Prevents an unbounded
// transcript from growing past the model's context window on long interviews.
const MAX_HISTORY_TURNS = 40;

function trimHistory(history: ChatMessage[]): void {
    const overflow = history.length - 1 - MAX_HISTORY_TURNS;
    if (overflow > 0) {
        history.splice(1, overflow);
    }
}

/**
 * Build a fresh interview session with the candidate's target role and GitHub
 * profile baked into the system prompt.
 */
export function createInterviewSession(
    userId: string,
    targetRole?: string,
    githubUsername?: string,
    githubRepos?: GithubRepoData[]
): InterviewSession {
    console.log(`[LLM] Creating interview session for user ${userId} — Role: "${targetRole}", GitHub: @${githubUsername}`);
    return {
        userId,
        targetRole,
        githubUsername,
        history: [
            { role: "system", content: buildSystemPrompt(targetRole, githubUsername, githubRepos) }
        ],
        lastActiveAt: Date.now(),
    };
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
    session: InterviewSession,
    userAnswer: string,
    signal: AbortSignal,
    callbacks: StreamCallbacks
) {
    let accumulatedResponse = "";
    try {
        session.lastActiveAt = Date.now();

        // 1. Commit candidate answers into history array bounds
        session.history.push({ role: "user", content: userAnswer });
        trimHistory(session.history);

        // 2. Initialise network request targeting the active high-speed versatile model
        const responseStream = await getGroq().chat.completions.create({
            model: GROQ_MODEL,
            messages: session.history,
            stream: true,
            temperature: 0.7,
        }, {
            signal: signal
        });

        let triggeredEditor = false;
        let triggeredHideEditor = false;
        // Rolling buffer: holds text that MIGHT contain a partial tag
        // Only safe (non-tag) content is flushed to TTS
        let ttsBuffer = "";
        // Longest tag we must hold back: "[SHOW_EDITOR:javascript]" is 24 chars.
        const MAX_TAG_LENGTH = 30;

        const flushSafeTtsContent = () => {
            ttsBuffer = stripMarkdown(stripControlTags(ttsBuffer));

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
        ttsBuffer = stripMarkdown(stripControlTags(ttsBuffer));
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
                const questionText = extractProblemStatement(accumulatedResponse, tagIndex, matchedTag.length);

                console.log("[Editor Trigger] lang:", lang, "| questionText (first 100):", questionText.substring(0, 100));
                callbacks.onEditorTrigger(lang, questionText);
            }
        }

        // 5. Commit fully completed output sequences into tracing logs
        const cleanedResponse = stripControlTags(accumulatedResponse);
        session.history.push({ role: "assistant", content: cleanedResponse });
        trimHistory(session.history);
        session.lastActiveAt = Date.now();
        callbacks.onComplete(accumulatedResponse);
        console.log("[LLM Full Response]:", accumulatedResponse);


    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'AbortError' || signal.aborted) {
            // Record whatever the interviewer managed to say before being cut off,
            // otherwise the transcript ends on an unanswered user turn.
            const partial = stripControlTags(accumulatedResponse).trim();
            session.history.push({
                role: "assistant",
                content: partial.length > 0 ? `${partial} (interrupted by the candidate)` : "(interrupted by the candidate)",
            });
            trimHistory(session.history);
            console.log("\n✅ [LLM Engine]: Successfully halted streaming generator pipelines cleanly.");
        } else {
            callbacks.onError(error);
        }
    }
}
