import { config } from "../config/env";
import { logger } from "../observability/logger";
import { ModelRouter, estimateTokens } from "./router";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export type ReasoningLevel = "none" | "low" | "medium" | "high";

export interface CompletionOptions {
    /** Preferred model. Defaults to the dialogue model. */
    model?: string;
    /** Tried in order if the preferred model is rate-limited or failing. Defaults to the configured fallbacks. */
    fallbackModels?: string[];
    temperature?: number;
    maxTokens?: number;
    /** How hard the model may think before answering. "none" is for live speech, where latency matters most. */
    reasoning?: ReasoningLevel;
    /** Ask for a single JSON object. */
    json?: boolean;
    /** How long to wait for a rate-limited model to free up before giving up. Live speech waits little; scoring waits long. */
    maxWaitMs?: number;
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

export class RateLimitedError extends Error {
    constructor(message = "The language model is busy. Try again in a moment.") {
        super(message);
        this.name = "RateLimitedError";
    }
}

class HttpFailure extends Error {
    constructor(public readonly status: number, message: string, public readonly retryAfterMs?: number) {
        super(message);
    }
}

const router = new ModelRouter(config.llmTpmLimit);
/** Models that rejected reasoning parameters; remember and stop sending them. */
const rejectedReasoning = new Set<string>();

function headerNumber(headers: Headers, name: string): number | undefined {
    const value = Number(headers.get(name));
    return Number.isFinite(value) && headers.get(name) !== null ? value : undefined;
}

/** Providers send retry-after in seconds; Groq also reports resets like "2m59.5s" or "705ms". */
function parseRetryAfter(headers: Headers): number | undefined {
    const seconds = headerNumber(headers, "retry-after");
    if (seconds !== undefined) return seconds * 1000;
    const reset = headers.get("x-ratelimit-reset-tokens");
    const match = reset?.match(/^(?:(\d+)m)?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/);
    if (!match) return undefined;
    return Number(match[1] ?? 0) * 60_000 + Number(match[2] ?? 0) * 1000 + Number(match[3] ?? 0);
}

async function post(model: string, messages: ChatMessage[], options: CompletionOptions, stream: boolean): Promise<Response> {
    if (!config.llmApiKey) throw new Error("GROQ_API_KEY is not set. Set it in backend/.env before starting an interview.");
    const body = {
        model,
        messages,
        stream,
        temperature: options.temperature ?? 0.6,
        max_completion_tokens: options.maxTokens ?? 400,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        ...(rejectedReasoning.has(model) ? {} : reasoningParams(model, options.reasoning ?? "none")),
    };
    const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.llmApiKey}` },
        body: JSON.stringify(body),
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });

    const limit = headerNumber(response.headers, "x-ratelimit-limit-tokens");
    if (limit !== undefined) router.learnLimit(model, limit);

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 400 && /reasoning/i.test(detail) && !rejectedReasoning.has(model)) {
            rejectedReasoning.add(model);
            logger.warn({ model }, "Model rejected reasoning parameters; retrying without them");
            return post(model, messages, options, stream);
        }
        throw new HttpFailure(response.status, `LLM ${response.status}: ${detail.slice(0, 300)}`, parseRetryAfter(response.headers));
    }
    return response;
}

/**
 * Sends the request to the first model that has token budget, falling through to the next on rate
 * limits and server errors. If every model is busy it waits (up to maxWaitMs) for the soonest to free up.
 */
async function send(messages: ChatMessage[], options: CompletionOptions, stream: boolean): Promise<{ response: Response; model: string; tokens: number }> {
    const preferred = options.model ?? config.groqModel;
    const chain = [preferred, ...(options.fallbackModels ?? config.llmFallbackModels).filter((m) => m !== preferred)];
    const tokens = messages.reduce((n, m) => n + estimateTokens(m.content), 0) + (options.maxTokens ?? 400);
    const deadline = Date.now() + (options.maxWaitMs ?? 8_000);
    const failed = new Set<string>();
    let lastError: unknown;

    for (;;) {
        if (options.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        const model = router.pick(chain, tokens, failed);

        if (!model) {
            const wait = Math.min(router.waitMs(chain.filter((m) => !failed.has(m)), tokens), 15_000);
            if (Date.now() + wait > deadline || failed.size >= chain.length) throw lastError instanceof HttpFailure && lastError.status !== 429 ? lastError : new RateLimitedError();
            await new Promise((resolve) => setTimeout(resolve, Math.max(150, wait)));
            failed.clear();
            continue;
        }

        router.record(model, tokens);
        try {
            const response = await post(model, messages, options, stream);
            if (model !== preferred) logger.info({ from: preferred, to: model }, "Using a fallback model");
            return { response, model, tokens };
        } catch (error) {
            lastError = error;
            if (options.signal?.aborted) throw error;
            const status = error instanceof HttpFailure ? error.status : undefined;
            if (status === 429) {
                router.cooldown(model, Math.min(Math.max(error instanceof HttpFailure ? (error.retryAfterMs ?? 20_000) : 20_000, 1_000), 60_000));
                logger.warn({ model }, "Model is rate limited; trying another");
            } else if (status !== undefined && status >= 500) {
                router.cooldown(model, 5_000);
                failed.add(model);
            } else if (status === undefined && !(error instanceof HttpFailure)) {
                // Network trouble or a timeout: treat the model as unavailable for this call.
                router.cooldown(model, 5_000);
                failed.add(model);
            } else {
                throw error; // a 4xx that another model won't fix (bad request, auth)
            }
        }
    }
}

async function* readSse(response: Response): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index: number;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
                const event = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                for (const line of event.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === "[DONE]") continue;
                    try {
                        const text = JSON.parse(data).choices?.[0]?.delta?.content;
                        if (typeof text === "string" && text) yield text;
                    } catch {
                        /* a partial or keep-alive line */
                    }
                }
            }
        }
    } finally {
        reader.cancel().catch(() => undefined);
    }
}

/** Chat completions over plain HTTP: works with Groq and any OpenAI-compatible provider. */
export class HttpLlm implements LlmClient {
    async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncIterable<string> {
        const { response } = await send(messages, options, true);
        yield* readSse(response);
    }

    async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
        const { response, model, tokens } = await send(messages, options, false);
        const result = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }>; usage?: { total_tokens?: number } };
        const used = result.usage?.total_tokens;
        if (used && used > tokens) router.record(model, used - tokens); // the estimate was low; account for the difference
        return result.choices?.[0]?.message?.content ?? "";
    }
}

let active: LlmClient = new HttpLlm();

export function getLlm(): LlmClient {
    return active;
}

/** Tests substitute a scripted model so nothing ever reaches a hosted service. Pass null to restore. */
export function setLlmForTesting(client: LlmClient | null): void {
    active = client ?? new HttpLlm();
}

/** The models in use. The evaluation model may be swapped for the dialogue model at boot if it isn't available. */
export const models = { dialogue: config.groqModel, evaluation: config.groqEvalModel, fallbacks: config.llmFallbackModels };

export async function verifyModels(): Promise<void> {
    if (!config.llmApiKey) return;
    try {
        const response = await fetch(`${config.llmBaseUrl}/models`, { headers: { Authorization: `Bearer ${config.llmApiKey}` }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`models list answered ${response.status}`);
        const { data } = (await response.json()) as { data?: Array<{ id: string }> };
        const available = new Set((data ?? []).map((m) => m.id));

        if (!available.has(models.dialogue)) {
            logger.error({ model: models.dialogue, available: [...available] }, "GROQ_MODEL is not available to this API key; interviews will fail over to the fallbacks");
        }
        models.fallbacks = models.fallbacks.filter((m) => available.has(m));
        if (!available.has(models.evaluation)) {
            logger.warn({ model: models.evaluation, fallback: models.dialogue }, "The evaluation model is not available; scoring will use the dialogue model");
            models.evaluation = models.dialogue;
        }
        logger.info({ dialogue: models.dialogue, evaluation: models.evaluation, fallbacks: models.fallbacks }, "LLM models ready");
    } catch (error) {
        logger.warn({ err: error }, "Could not verify the model list");
    }
}
