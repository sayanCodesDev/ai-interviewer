import { FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "@/content/roles.generated";

const formats = FORMAT_CONTENT.map((f) => `${f.label.toLowerCase()} (${f.minutes} minutes)`);
const roles = ROLE_CONTENT.map((r) => r.role);

/** Shared by the visible FAQ and the FAQPage structured data, so the two can never disagree. */
export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
    {
        q: "What is Intervyu?",
        a: "Intervyu is an AI mock interviewer for software engineers. You tell it the job you're preparing for, and it runs a realistic technical interview out loud: questions about your background and projects, live coding against hidden tests, technical and behavioral questions, and system design on a whiteboard. Then it gives you a scored report with a study plan.",
    },
    {
        q: "What do I need to take an interview?",
        a: "A modern browser, a microphone and somewhere quiet. There's no camera involved. If you'd rather not speak for a moment, you can type your answer instead, and live captions show both sides of the conversation.",
    },
    {
        q: "How is this different from practising with a chatbot?",
        a: "It runs like a real interview loop. A conductor decides the rounds, the questions and when to move on, so you get an introduction, background questions, coding problems with hidden tests, technical questions from the job description, a behavioral round and time for your own questions. The interviewer speaks first, waits for you to finish your thought, follows up on what you actually said, and makes the next coding problem harder or easier depending on how the last one went.",
    },
    {
        q: "How are the questions chosen?",
        a: "You paste the job description, give your GitHub profile and can add your resume. The interviewer builds the technical and behavioral questions from the skills the role asks for, asks about the projects you've actually worked on, and picks coding problems on the topics the job calls for, at your level.",
    },
    {
        q: "Which interview formats can I choose?",
        a: `You can choose a ${formats.slice(0, -1).join(", a ")} or a ${formats.at(-1)}. Intervyu suggests one for your level (the full loop for senior and staff engineers) and you can pick any of them.`,
    },
    {
        q: "Is there a whiteboard for system design?",
        a: "Yes. In a system-design round the editor becomes a whiteboard where you draw boxes and arrows, and when you share it the interviewer reads your diagram and asks about it. You can also open the whiteboard on any other question to sketch out an answer. Interns and juniors get a round on concepts and trade-offs instead of system design.",
    },
    {
        q: "Which programming languages can I use?",
        a: `${PRODUCT_STATS.languages.slice(0, -1).join(", ")} and ${PRODUCT_STATS.languages.at(-1)}. The editor has starter code for each, runs your code against the examples or your own input, and grades your submission against hidden tests. You can switch language at any point without losing your code.`,
    },
    {
        q: "Which roles can I practise for?",
        a: `${roles.slice(0, -1).join(", ")} and ${roles.at(-1)}. Each has its own page showing what the interview covers and sample questions.`,
    },
    {
        q: "What do I get at the end?",
        a: "About a minute after you finish: a score out of 100 with a readiness band, a breakdown by skill, feedback on each part of the interview, your solutions with their test results, what you did well and what to change, a study plan in priority order and the full transcript. Any topic on the plan can be retried in one click.",
    },
    {
        q: "How is my score decided?",
        a: "Correctness comes from actually running your code against tests. The other skills are judged from your transcript against a rubric, and every point in the report is tied to a quote from what you said, checked to be real. The overall score is computed by the system, not written by the model. It's practice feedback, not a hiring decision.",
    },
    {
        q: "What happens to my data?",
        a: "Your voice is processed live and never recorded as audio. We keep the transcript, your code and your report so you can review them, and you can delete any interview or your whole account at any time.",
    },
];
