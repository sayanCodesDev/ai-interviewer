/**
 * The landing page's example interview, from joining the call to the goodbye. One script drives the captions, the
 * screen (which panel is open, the round, the clock) and the optional audio: scripts/make-demo-audio.ts synthesises
 * each spoken line with the same Deepgram voices the interview room uses, into public/demo/<id>.mp3, and records how
 * long each one is in demoAudio.generated.ts so every step lasts as long as its line takes to say.
 *
 * Edit a line here, then re-run the script so the audio and the timing match the new words.
 */

export type DemoView = "connecting" | "talk" | "code" | "tests" | "design";

export interface DemoStep {
    id: string;
    speaker: "ai" | "user" | null;
    text: string;
    view: DemoView;
    round: string;
    /** Where the interview's clock stands when this step starts: the demo skips the minutes in between. */
    clock: number;
    /** The least time the step needs on screen for its animation (typing the code, drawing the diagram), in ms. */
    minMs: number;
}

/** The interviewer names itself after its voice (see backend webrtc/live.ts); Thalia is the default. */
export const DEMO_VOICES = { ai: "aura-2-thalia-en", user: "aura-2-luna-en" } as const;

const m = (minutes: number, seconds = 0) => minutes * 60 + seconds;

export const DEMO: readonly DemoStep[] = [
    { id: "join", speaker: null, text: "Connecting to your interviewer…", view: "connecting", round: "Round 1 of 7 · Introduction", clock: 0, minMs: 2000 },
    {
        id: "greet",
        speaker: "ai",
        text: "Hi Ada, I'm Thalia, your interviewer for the backend engineer role. We'll talk about your background, do some coding and a bit of system design, then leave time for your questions. To start, tell me a little about yourself.",
        view: "talk",
        round: "Round 1 of 7 · Introduction",
        clock: 0,
        minMs: 0,
    },
    {
        id: "intro",
        speaker: "user",
        text: "Sure. I'm a backend engineer, mostly Go and Postgres. Lately I've been building a webhook delivery service for a payments team.",
        view: "talk",
        round: "Round 1 of 7 · Introduction",
        clock: m(0, 17),
        minMs: 0,
    },
    {
        id: "follow",
        speaker: "ai",
        text: "Nice. I saw that webhook service on your GitHub. How did you make the retries safe?",
        view: "talk",
        round: "Round 2 of 7 · Background",
        clock: m(3, 4),
        minMs: 0,
    },
    {
        id: "answer",
        speaker: "user",
        text: "Every event carries an idempotency key, so if a delivery is retried, processing it again is a no-op.",
        view: "talk",
        round: "Round 2 of 7 · Background",
        clock: m(3, 11),
        minMs: 0,
    },
    {
        id: "problem",
        speaker: "ai",
        text: "That makes sense. Let's move to a coding problem. Given an array of numbers and a target, return the indices of the two numbers that add up to it. The full problem is opening in your editor now.",
        view: "talk",
        round: "Round 3 of 7 · Coding",
        clock: m(9, 40),
        minMs: 0,
    },
    {
        id: "code",
        speaker: "user",
        text: "I'll keep a hash map of what I've seen, so I can do it in one pass.",
        view: "code",
        round: "Round 3 of 7 · Coding",
        clock: m(9, 52),
        minMs: 7200,
    },
    {
        id: "tests",
        speaker: "ai",
        text: "All fourteen hidden tests passed. Nicely done. What's the time complexity?",
        view: "tests",
        round: "Round 3 of 7 · Coding",
        clock: m(16, 5),
        minMs: 3200,
    },
    {
        id: "complexity",
        speaker: "user",
        text: "Linear time, since it's one pass, and linear space for the map.",
        view: "tests",
        round: "Round 3 of 7 · Coding",
        clock: m(16, 12),
        minMs: 0,
    },
    {
        id: "design",
        speaker: "ai",
        text: "Good. For the design part, sketch how you'd deliver a million webhooks a day, at least once, and never processed twice.",
        view: "design",
        round: "Round 5 of 7 · System design",
        clock: m(38, 30),
        minMs: 9000,
    },
    {
        id: "wrap",
        speaker: "ai",
        text: "That's everything from me. Thanks, Ada, this was great. Your report, with a score and a study plan, will be ready in about a minute.",
        view: "talk",
        round: "Round 7 of 7 · Wrap-up",
        clock: m(72, 10),
        minMs: 0,
    },
];
