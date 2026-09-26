import Groq from "groq-sdk";
import { config } from "../config/env";
import { logger } from "../observability/logger";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export type ReasoningLevel = "none" | "low" | "medium" | "high";

export interface CompletionOptions {
    /** Defaults to the dialogue model. Scoring passes the evaluation model. */
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** How hard the model may think before answering. "none" is for live speech, where latency matters most. */
    reasoning?: ReasoningLevel;
    /** Ask for a single JSON object. */
    json?: boolean;
    signal?: AbortSignal;
}

export interface LlmClient {
    /** Streams the reply as it is generated. */
    stream(messages: ChatMessage[], options?: CompletionOptions): AsyncIterable<string>;
    /** Waits for the whole reply. */
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}

/**
 * Reasoning is configured differently per model family. Qwen takes none|default; gpt-oss takes
 * low|medium|high and cannot turn thinking off. Unknown models get no reasoning parameters at all.
 */
export function reasoningParams(model: string, level: ReasoningLevel): Record<string, unknown> {
    if (/qwen/i.test(model)) return { reasoning_effort: level === "none" ? "none" : "default" };
    if (/gpt-oss/i.test(model)) return { reasoning_effort: level === "none" ? "low" : level };
    return {};
}

/** Groq answers 400 for a parameter a given model doesn't accept; remember it and stop sending it. */
const rejectedReasoning = new Set<string>();

let groqClient: Groq | null = null;

function getGroq(): Groq {
    if (!groqClient) {
        if (!config.groqApiKey) throw new Error("GROQ_API_KEY is not set. Set it in backend/.env before starting an interview.");
        groqClient = new Groq({ apiKey: config.groqApiKey, timeout: 45_000, maxRetries: 1 });
    }
    return groqClient;
}

function requestBody(messages: ChatMessage[], options: CompletionOptions, stream: boolean) {
    const model = options.model ?? config.groqModel;
    return {
        model,
        messages,
        stream,
        temperature: options.temperature ?? 0.6,
        max_completion_tokens: options.maxTokens ?? 400,
        ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
        ...(rejectedReasoning.has(model) ? {} : reasoningParams(model, options.reasoning ?? "none")),
    };
}

function isReasoningRejection(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    const message = String((error as Error)?.message ?? "");
    return status === 400 && /reasoning/i.test(message);
}

async function withRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await run();
        } catch (error) {
            const status = (error as { status?: number })?.status;
            if (signal?.aborted || attempt >= 2 || !(status === 429 || (status !== undefined && status >= 500))) throw error;
            const retryAfter = Number((error as { headers?: Record<string, string> })?.headers?.["retry-after"]);
            await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 8000) : 600 * 2 ** attempt));
        }
    }
}

export class GroqLlm implements LlmClient {
    async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncIterable<string> {
        const create = () => getGroq().chat.completions.create(requestBody(messages, options, true) as never, { signal: options.signal });
        let response: AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null } }> }>;
        try {
            response = (await withRetry(create, options.signal)) as never;
        } catch (error) {
            if (!isReasoningRejection(error)) throw error;
            rejectedReasoning.add(options.model ?? config.groqModel);
            logger.warn({ model: options.model ?? config.groqModel }, "Model rejected reasoning parameters; retrying without them");
            response = (await create()) as never;
        }

        for await (const chunk of response) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) yield text;
        }
    }

    async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
        const create = () => getGroq().chat.completions.create(requestBody(messages, options, false) as never, { signal: options.signal });
        let result: { choices?: Array<{ message?: { content?: string | null } }> };
        try {
            result = (await withRetry(create, options.signal)) as never;
        } catch (error) {
            if (!isReasoningRejection(error)) throw error;
            rejectedReasoning.add(options.model ?? config.groqModel);
            result = (await create()) as never;
        }
        return result.choices?.[0]?.message?.content ?? "";
    }
}

let active: LlmClient = new GroqLlm();

export function getLlm(): LlmClient {
    return active;
}

/** Tests substitute a scripted model so nothing ever reaches a hosted service. Pass null to restore. */
export function setLlmForTesting(client: LlmClient | null): void {
    active = client ?? new GroqLlm();
}

/**
 * The evaluation model may not exist for every API key. Checked once at boot: warns about a bad
 * dialogue model, and falls back to it if the evaluation model is unavailable.
 */
export const models = { dialogue: config.groqModel, evaluation: config.groqEvalModel };

export async function verifyModels(): Promise<void> {
    if (!config.groqApiKey) return;
    try {
        const { data } = await getGroq().models.list();
        const available = new Set((data ?? []).map((m) => m.id));
        if (!available.has(models.dialogue)) {
            logger.error({ model: models.dialogue, available: [...available] }, "GROQ_MODEL is not available to this API key; interviews will fail");
        }
        if (!available.has(models.evaluation)) {
            logger.warn({ model: models.evaluation, fallback: models.dialogue }, "GROQ_EVAL_MODEL is not available; scoring will use the dialogue model");
            models.evaluation = models.dialogue;
        }
        logger.info({ dialogue: models.dialogue, evaluation: models.evaluation }, "LLM models ready");
    } catch (error) {
        logger.warn({ err: error }, "Could not verify the Groq model list");
    }
}
