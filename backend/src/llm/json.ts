import type { ZodType } from "zod";
import { getLlm, models, type ChatMessage, type CompletionOptions } from "./client";

/** Pulls the JSON object out of a model reply that may carry reasoning, prose or a code fence around it. */
export function extractJson(text: string): unknown {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) cleaned = fenced[1]!.trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The reply contained no JSON object.");
    return JSON.parse(cleaned.slice(start, end + 1));
}

export class StructuredOutputError extends Error {
    constructor(message: string, public readonly lastReply: string) {
        super(message);
        this.name = "StructuredOutputError";
    }
}

/**
 * Asks for a JSON object and validates it against a schema. If the reply is malformed or fails
 * validation, the model is shown exactly what was wrong and given one chance to correct it.
 */
export async function completeJson<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
    options: Omit<CompletionOptions, "json"> = {},
): Promise<T> {
    const llm = getLlm();
    const model = options.model ?? models.dialogue;
    let conversation = messages;
    let lastReply = "";
    let lastProblem = "";
    // Groq's JSON mode rejects a malformed generation with a 400 ("json_validate_failed") instead of returning it.
    // When that happens the request is repeated without JSON mode; our own parser and the schema do the checking.
    let jsonMode = true;

    for (let attempt = 0; attempt < 2; attempt++) {
        // A reasoning model can spend its whole allowance thinking and return nothing. The correction round gets more room.
        const maxTokens = attempt === 0 ? options.maxTokens : Math.ceil((options.maxTokens ?? 400) * 1.7);
        try {
            lastReply = await llm.complete(conversation, { ...options, maxTokens, model, json: jsonMode });
        } catch (error) {
            if (jsonMode && /json_validate_failed|Failed to generate JSON/i.test(String((error as Error)?.message ?? error))) {
                // Switching off JSON mode is not a correction round, so it doesn't use up an attempt.
                jsonMode = false;
                lastProblem = "the provider rejected the previous generation as invalid JSON";
                attempt--;
                continue;
            }
            throw error;
        }
        try {
            const parsed = schema.safeParse(extractJson(lastReply));
            if (parsed.success) return parsed.data;
            lastProblem = parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
        } catch (error) {
            lastProblem = (error as Error).message;
        }
        conversation = [
            ...messages,
            { role: "assistant", content: lastReply.slice(0, 6000) },
            { role: "user", content: `That reply was not valid. Problems: ${lastProblem}. Reply again with ONLY the corrected JSON object.` },
        ];
    }
    throw new StructuredOutputError(`The model did not return valid JSON: ${lastProblem}`, lastReply);
}
