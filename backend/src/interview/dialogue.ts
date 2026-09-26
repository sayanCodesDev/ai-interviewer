import type { ChatMessage, CompletionOptions, LlmClient } from "../llm/client";
import { SentenceChunker } from "../voice/sentenceChunker";
import { SpeechStreamFilter } from "../voice/speechFilter";

export interface ReplyResult {
    /** Everything the interviewer said, cleaned of reasoning, markers and markdown. */
    text: string;
    /** Control markers the model emitted, in order: ADVANCE, HINT, MOVE_ON, END. */
    markers: string[];
    /** The reply was cut short by the candidate speaking. */
    interrupted: boolean;
    /** Milliseconds from asking until the first spoken sentence was ready. */
    firstSentenceMs: number | null;
    /** For a reply the candidate cut in on: whether they had heard all of it. Set by the caller, which knows what was played. */
    delivered?: boolean;
}

export interface ReplyOptions extends CompletionOptions {
    /** Called with each finished sentence as soon as it is ready, so speech can start early. */
    onSentence?: (sentence: string) => void;
}

function isAbort(error: unknown): boolean {
    const name = (error as { name?: string })?.name;
    return name === "AbortError" || name === "APIUserAbortError" || /abort/i.test(String((error as Error)?.message ?? ""));
}

/**
 * Turns a streamed model reply into what the call needs: whole sentences to speak, the markers the
 * conductor acts on, and a clean transcript. Reasoning and markers never appear in the sentences.
 */
export async function streamReply(llm: LlmClient, messages: ChatMessage[], options: ReplyOptions = {}): Promise<ReplyResult> {
    const filter = new SpeechStreamFilter();
    const chunker = new SentenceChunker();
    const spoken: string[] = [];
    const markers: string[] = [];
    const started = Date.now();
    let firstSentenceMs: number | null = null;
    let interrupted = false;

    const emit = (sentences: string[]) => {
        for (const sentence of sentences) {
            firstSentenceMs ??= Date.now() - started;
            spoken.push(sentence);
            options.onSentence?.(sentence);
        }
    };

    try {
        for await (const delta of llm.stream(messages, options)) {
            if (options.signal?.aborted) {
                interrupted = true;
                break;
            }
            const out = filter.push(delta);
            markers.push(...out.markers);
            emit(chunker.push(out.text));
        }
        if (!interrupted) {
            const tail = filter.end();
            markers.push(...tail.markers);
            emit(chunker.push(tail.text));
            emit(chunker.flush());
        }
    } catch (error) {
        if (!isAbort(error) && !options.signal?.aborted) throw error;
        interrupted = true;
    }

    // A reply cut off by the candidate speaking never gets to act on its markers.
    return { text: spoken.join(" "), markers: interrupted ? [] : markers, interrupted, firstSentenceMs };
}
