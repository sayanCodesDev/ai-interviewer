/** Shared by the visible FAQ and the FAQPage structured data, so the two can never disagree. */
export const FAQ = [
    {
        q: "What do I need to take an interview?",
        a: "A modern browser, a working microphone and somewhere quiet. It's audio only, so there's no camera involved. If you'd rather not speak, you can type your answers instead.",
    },
    {
        q: "How is this different from a chat with an AI?",
        a: "It runs like a real loop. A conductor decides the rounds and the questions, so you get an introduction, background questions about your resume, live coding problems with hidden tests, technical questions drawn from the job description, a behavioral round and time to ask your own questions. The interviewer speaks first and follows up on what you actually say.",
    },
    {
        q: "How are the questions chosen?",
        a: "You paste the job description and give your GitHub profile, and can add your resume. The interviewer picks the coding problems and builds the technical and behavioral questions from the skills the role asks for and the projects you've actually worked on, at your level, and adjusts the next problem to how the last one went.",
    },
    {
        q: "Which programming languages can I use?",
        a: "JavaScript, TypeScript, Python, C++ and Java. The editor has starter code for each, runs your code against the examples, and grades your submission against hidden tests. You can switch language at any point without losing your code.",
    },
    {
        q: "What do I get at the end?",
        a: "A scored report out of 100 with a breakdown by skill, feedback on each part of the interview, your solutions with test results, the moments where your effort showed, what to change, a prioritised study plan, and the full transcript.",
    },
    {
        q: "How is my score decided?",
        a: "Correctness comes from actually running your code against tests. The other skills are judged from your transcript against a rubric, and every point in the report is tied to something you said. The overall score is computed by the system, not written by the model. It's practice feedback, not a hiring decision.",
    },
    {
        q: "What happens to my data?",
        a: "Your conversation is processed live and is not recorded as audio. We keep the transcript, your code and your report so you can review them, and you can delete any interview or your whole account at any time.",
    },
] as const;
