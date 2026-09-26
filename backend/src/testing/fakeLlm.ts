import type { ChatMessage, CompletionOptions, LlmClient } from "../llm/client";

export interface FakeCall {
    messages: ChatMessage[];
    options: CompletionOptions;
}

type Script = string | ((call: FakeCall) => string);

/**
 * A scripted language model for tests. Each call consumes the next reply from the queue (or from
 * the fallback), streams it in small chunks like a real model would, and records what it was asked.
 */
export class FakeLlm implements LlmClient {
    readonly calls: FakeCall[] = [];
    private queue: Script[] = [];

    constructor(private readonly fallback: Script = "Okay.", private readonly chunkSize = 4) {}

    enqueue(...replies: Script[]): this {
        this.queue.push(...replies);
        return this;
    }

    private next(call: FakeCall): string {
        const script = this.queue.shift() ?? this.fallback;
        return typeof script === "function" ? script(call) : script;
    }

    async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncIterable<string> {
        const call = { messages, options };
        this.calls.push(call);
        const text = this.next(call);
        for (let i = 0; i < text.length; i += this.chunkSize) {
            if (options.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
            await Promise.resolve();
            yield text.slice(i, i + this.chunkSize);
        }
    }

    async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
        const call = { messages, options };
        this.calls.push(call);
        return this.next(call);
    }
}
