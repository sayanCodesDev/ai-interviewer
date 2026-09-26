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

    for (let attempt = 0; attempt < 2; attempt++) {
        lastReply = await llm.complete(conversation, { ...options, model, json: true });
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
