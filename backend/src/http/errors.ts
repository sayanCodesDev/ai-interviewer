import type { ZodType } from "zod";

/** An error that is safe to show the client: the message and status are ours, not a library's. */
export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code?: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "HttpError";
    }
}

/** Parses untrusted input, turning a failure into a 400 with per-field messages. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] ??= issue.message;
    }
    const first = Object.values(fields)[0] ?? "Invalid request";
    throw new HttpError(400, first, "invalid_input", fields);
}
