/**
 * The landing page's example, as a short guided video in three chapters: setting up the interview from the job,
 * the interview itself (from joining the call to the goodbye), and the report. One script drives the chapter bar,
 * the captions, the screen and the optional audio: scripts/make-demo-audio.ts synthesises each spoken line (the
 * interviewer and candidate in the same Deepgram voices the room uses, plus a narrator for the setup and the report)
 * into public/demo/<id>.mp3, and records how long each is in demoAudio.generated.ts so every step lasts as long as
 * its line takes to say.
 *
 * Edit a line here, then re-run the script so the audio and the timing match the new words.
 */

export type DemoChapter = "setup" | "interview" | "report";
export type DemoView = "title" | "setup" | "connecting" | "talk" | "code" | "tests" | "design" | "report";
/** The parts of the report the report chapter scrolls to, in page order. */
export const REPORT_SECTIONS = ["score", "skills", "code", "plan"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export interface DemoStep {
    id: string;
    chapter: DemoChapter;
    speaker: "ai" | "user" | "narrator" | null;
    text: string;
    view: DemoView;
    /** The interview's round, shown in the room's title bar. */
    round?: string;
    /** Where the interview's clock stands when this step starts: the demo skips the minutes in between. */
    clock?: number;
    /** The least time the step needs on screen for its animation (filling the form, typing the code, drawing), in ms. */
    minMs: number;
    /** In the report chapter: the part of the report scrolled into view while this line is spoken. */
    section?: ReportSection;
}

export const CHAPTERS: ReadonlyArray<{ id: DemoChapter; label: string; title: string }> = [
    { id: "setup", label: "Set up", title: "Tell it about the job" },
    { id: "interview", label: "Interview", title: "Do the interview" },
    { id: "report", label: "Report", title: "Get your report" },
];

/** The interviewer names itself after its voice (see backend webrtc/live.ts); Thalia is the default. */
export const DEMO_VOICES = { ai: "aura-2-thalia-en", user: "aura-2-luna-en", narrator: "aura-2-orion-en" } as const;

const m = (minutes: number, seconds = 0) => minutes * 60 + seconds;

export const DEMO: readonly DemoStep[] = [
    { id: "title-setup", chapter: "setup", speaker: null, text: "Step 1 of 3", view: "title", minMs: 1900 },
    {
        id: "setup",
        chapter: "setup",
        speaker: "narrator",
        text: "First, tell Intervyu about the job you want: the role, your level and the job description. Add your resume and GitHub, and every round is planned around them.",
        view: "setup",
        minMs: 11500,
    },

    { id: "title-interview", chapter: "interview", speaker: "narrator", text: "Now, here's a glimpse of the interview.", view: "title", minMs: 1900 },
    { id: "join", chapter: "interview", speaker: null, text: "Connecting to your interviewer…", view: "connecting", round: "Round 1 of 7 · Introduction", clock: 0, minMs: 1600 },
    {
        id: "greet",
        chapter: "interview",
        speaker: "ai",
        text: "Hi Ada, I'm Thalia, your interviewer for the backend engineer role. We'll cover your background, some coding and a little system design. To start, tell me about yourself.",
        view: "talk",
        round: "Round 1 of 7 · Introduction",
        clock: 0,
        minMs: 0,
    },
    {
        id: "intro",
        chapter: "interview",
        speaker: "user",
        text: "Sure. I'm a backend engineer, mostly Go and Postgres. Lately I've been building a webhook delivery service for a payments team.",
        view: "talk",
        round: "Round 1 of 7 · Introduction",
        clock: m(0, 14),
        minMs: 0,
    },
    {
        id: "follow",
        chapter: "interview",
        speaker: "ai",
        text: "Nice. I saw that webhook service on your GitHub. How did you make the retries safe?",
        view: "talk",
        round: "Round 2 of 7 · Background",
        clock: m(3, 4),
        minMs: 0,
    },
    {
        id: "answer",
        chapter: "interview",
        speaker: "user",
        text: "Every event carries an idempotency key, so if a delivery is retried, processing it again is a no-op.",
        view: "talk",
        round: "Round 2 of 7 · Background",
        clock: m(3, 11),
        minMs: 0,
    },
    {
        id: "problem",
        chapter: "interview",
        speaker: "ai",
        text: "That makes sense. Let's do a coding problem: given an array and a target, return the indices of the two numbers that add up to it.",
        view: "talk",
        round: "Round 3 of 7 · Coding",
        clock: m(9, 40),
        minMs: 0,
    },
    {
        id: "code",
        chapter: "interview",
        speaker: "user",
        text: "I'll keep a hash map of what I've seen, so I can do it in one pass.",
        view: "code",
        round: "Round 3 of 7 · Coding",
        clock: m(9, 52),
        minMs: 7200,
    },
    // Submitted: the hidden tests run and pass on screen, without a word, and the interview flows straight on.
    {
        id: "tests",
        chapter: "interview",
        speaker: null,
        text: "",
        view: "tests",
        round: "Round 3 of 7 · Coding",
        clock: m(16, 5),
        minMs: 3200,
    },
    {
        id: "design",
        chapter: "interview",
        speaker: "ai",
        text: "Nice work. For the last part, sketch how you'd deliver a million webhooks a day without ever processing one twice.",
        view: "design",
        round: "Round 5 of 7 · System design",
        clock: m(38, 30),
        minMs: 8500,
    },
    {
        id: "wrap",
        chapter: "interview",
        speaker: "ai",
        text: "That's everything from me. Thanks, Ada. Your report will be ready in about a minute.",
        view: "talk",
        round: "Round 7 of 7 · Wrap-up",
        clock: m(72, 10),
        minMs: 0,
    },

    { id: "title-report", chapter: "report", speaker: "narrator", text: "About a minute later, your report is ready.", view: "title", minMs: 1900 },
    {
        id: "report-score",
        chapter: "report",
        speaker: "narrator",
        text: "It opens with your score out of 100, how ready you are, and a summary of how it went.",
        view: "report",
        section: "score",
        minMs: 4000,
    },
    {
        id: "report-skills",
        chapter: "report",
        speaker: "narrator",
        text: "Every skill is scored, with quotes from what you actually said as the evidence.",
        view: "report",
        section: "skills",
        minMs: 4000,
    },
    {
        id: "report-code",
        chapter: "report",
        speaker: "narrator",
        text: "Your code is reviewed line by line, next to the intended solution.",
        view: "report",
        section: "code",
        minMs: 4000,
    },
    {
        id: "report-plan",
        chapter: "report",
        speaker: "narrator",
        text: "And it ends with a study plan in priority order. Practise any topic again in one click.",
        view: "report",
        section: "plan",
        minMs: 4500,
    },
];
