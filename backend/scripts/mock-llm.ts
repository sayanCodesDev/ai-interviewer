// A stand-in for the language-model provider, for trying the whole product without spending tokens:
//
//   npx tsx scripts/mock-llm.ts            # listens on http://127.0.0.1:2099
//   LLM_BASE_URL=http://127.0.0.1:2099/v1 LLM_API_KEY=mock VOICE_MODE=text npm run dev
//
// It speaks the OpenAI-compatible chat API the backend already uses. The interviewer follows each step's
// instructions mechanically ("Interesting, say more", then moves on when told to), and scoring returns valid
// reports whose quotes are taken from what the candidate really said, so the report page has evidence to show.
// The scores are derived from how much the candidate said, which is enough to see the pipeline work end to end.
// It is a development tool. It is not smart, and it never runs in production.
import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 2099);

interface Message { role: string; content: string }

// --------------------------------------------------------------------------------- the interviewer

function interviewer(messages: Message[]): string {
    const directive = messages[messages.length - 1]?.content ?? "";
    if (/end with \[\[END\]\]/.test(directive)) return "Thank you, that was a good conversation. You'll have a detailed report shortly. Take care. [[END]]";
    if (/No answer for a long time/.test(directive)) return "That's fine, let's move on. [[ADVANCE]]";
    if (/\[\[HINT\]\]/.test(directive) && /stuck or ask for a hint/.test(directive) && /hint/i.test(messages[messages.length - 2]?.content ?? "")) {
        return "Think about what you could store as you scan the input so you never need a second pass. [[HINT]]";
    }
    if (/\[\[ADVANCE\]\]/.test(directive) && !/EITHER/.test(directive)) return "Thanks, that covers it. [[ADVANCE]]";
    if (/complexity/i.test(directive)) return "Thanks. What is the time and space complexity of your solution, and why?";
    if (/submitted|test results|passed|failed/i.test(directive)) return "Thanks for submitting that. Let's see how it did.";
    if (/They just spoke/.test(directive) && /working on/.test(directive)) return "Sounds workable. Go ahead and code it.";
    if (/Open the interview/.test(directive)) return "Hi, I'm Thalia, and I'll be your interviewer today. We'll talk about your background, work through a coding problem, and finish with a few questions. Ready to start?";
    if (/asked?:/i.test(directive) || /Ask in your own words/.test(directive)) return "Great. Tell me a little about what you've been working on recently.";
    return "Interesting. Could you say a bit more about that?";
}

// ---------------------------------------------------------------------------------------- scoring

function candidateLines(user: string): Array<{ n: number; text: string }> {
    return [...user.matchAll(/^\[(\d+)\]\s*(?:Candidate|You|candidate):\s*(.+)$/gim)].map((m) => ({ n: Number(m[1]), text: m[2]!.trim() }));
}

function quote(text: string): string {
    return text.split(/\s+/).slice(0, 10).join(" ").replace(/[.,;:!?]+$/, "");
}

function segmentReply(system: string, user: string): object {
    const lines = candidateLines(user);
    const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    const average = lines.length ? words / lines.length : 0;
    const score = Math.max(1, Math.min(9, Math.round(average / 8)));
    const dims = [...(system.match(/Score these dimensions: ([^\n]+)\./)?.[1] ?? "").matchAll(/(\w+) \(/g)].map((m) => m[1]!);
    const best = [...lines].sort((a, b) => b.text.length - a.text.length)[0];
    const evidence = best ? [{ turn: best.n, quote: quote(best.text) }] : [];
    const hasProblem = /"problem": \{/.test(system);
    return {
        score,
        summary: average > 20 ? "You gave clear, specific answers with concrete detail." : "Your answers were brief and stayed at a high level.",
        highlights: average > 20 ? ["Specific examples"] : ["Room for more detail"],
        signals: dims.map((key) => ({ dimension: key, score: Math.max(0, Math.min(10, score + (key.length % 3) * 0.5)), note: "Based on how this part went.", evidence })),
        strengths: average > 20 ? [{ title: "Concrete, specific answers", detail: "You backed your points with real examples and trade-offs.", evidence }] : [],
        gaps: average > 20 ? [] : [{ title: "Answers stayed high level", detail: "Add a specific example, the decision you made and why.", priority: 1, evidence }],
        ...(hasProblem ? { problem: { complexity: { stated: "See the discussion", verdict: average > 20 ? "correct" : "partially" }, codeQuality: "Readable and direct.", feedback: "Explain your approach before coding and state the complexity unprompted." } } : {}),
    };
}

function synthesisReply(system: string, user: string): object {
    const dims = [...(system.match(/"dimensionSummaries": \{([^}]*)\}/)?.[1] ?? "").matchAll(/"(\w+)":/g)].map((m) => m[1]!);
    const strengthId = user.match(/^\s+([\w.-]+) STRENGTH/m)?.[1];
    const gapId = user.match(/^\s+([\w.-]+) GAP/m)?.[1];
    const good = /score ([6-9](?:\.\d)?)/.test(user);
    return {
        summary: good
            ? "You explained your experience clearly and worked through the problem methodically. The biggest opportunity is stating trade-offs and complexity without being asked."
            : "You have the basics, but your answers were short and often stayed general. Practise turning each answer into an example with a decision and its result.",
        dimensionSummaries: Object.fromEntries(dims.map((d) => [d, "A short note on this dimension."])),
        strengths: strengthId ? [{ title: "Clear, specific answers", detail: "Your examples made your experience believable.", sources: [strengthId] }] : [],
        improvements: [{ title: "Say the trade-off out loud", detail: "For each choice, name the alternative and why you did not pick it.", priority: 1, sources: gapId ? [gapId] : [] }],
        studyPlan: [
            { topic: "Explaining trade-offs", why: "Interviewers listen for the reasoning behind a choice.", actions: ["Pick three past decisions and write two sentences each: what you chose, what you rejected, and why."], priority: "high", resourceTags: ["system-design"] },
            { topic: "Complexity analysis", why: "Stating time and space unprompted signals fluency.", actions: ["After every practice problem, say the time and space complexity before running the code."], priority: "medium", resourceTags: ["algorithms"] },
        ],
    };
}

// ----------------------------------------------------------------------------------------- server

function replyFor(messages: Message[], json: boolean): string {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (json) {
        if (system.startsWith("SEGMENT ANALYSIS")) return JSON.stringify(segmentReply(system, user));
        if (system.startsWith("SYNTHESIS")) return JSON.stringify(synthesisReply(system, user));
        return "{}";
    }
    // Round notes are the only non-streamed, non-JSON calls.
    if (system.startsWith("You take concise interviewer's notes")) return "The candidate answered the questions in this part.";
    return interviewer(messages);
}

const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"].map((id) => ({ id })) }));
        return;
    }
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
        res.statusCode = 404;
        res.end("not found");
        return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: Message[]; stream?: boolean; response_format?: { type: string } };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";

    // The job-description analysis is the one structured call the mock doesn't try to imitate: refusing it
    // makes the backend use its built-in question bank, which is what a fresh install without a key gets anyway.
    if (body.response_format && system.startsWith("You design realistic mock technical interviews")) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: { message: "The mock provider does not analyse job descriptions." } }));
        return;
    }

    const text = replyFor(body.messages, body.response_format?.type === "json_object");
    const usage = { total_tokens: Math.ceil(JSON.stringify(body.messages).length / 4) };
    res.setHeader("x-ratelimit-limit-tokens", "8000000");

    if (!body.stream) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }], usage }));
        return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    for (let i = 0; i < text.length; i += 7) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 7) } }] })}\n\n`);
        await new Promise((resolve) => setTimeout(resolve, 12));
    }
    res.write("data: [DONE]\n\n");
    res.end();
});

server.listen(PORT, "127.0.0.1", () => console.log(`Mock language model on http://127.0.0.1:${PORT}/v1 (set LLM_BASE_URL to use it)`));
