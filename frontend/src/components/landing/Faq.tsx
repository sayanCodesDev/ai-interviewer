import { m } from "motion/react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fadeUp, inViewOnce } from "@/lib/motion";

const QUESTIONS = [
    {
        q: "What do I need to take an interview?",
        a: "A modern browser, a working microphone and somewhere quiet. It's audio only, so there's no camera involved.",
    },
    {
        q: "What happens during the interview?",
        a: "You start with a short spoken introduction. Then you work through data structures and algorithms problems in a live code editor, answering follow-up questions about time and space complexity as you go.",
    },
    {
        q: "Which programming languages can I use?",
        a: "JavaScript, TypeScript, Python, C++ and Java. You can switch language from the editor at any point.",
    },
    {
        q: "Does it use my GitHub?",
        a: "Only if you share it. When you add your GitHub profile, the interviewer reads your public repositories to tailor its questions. Leave it blank and you'll get general questions for your chosen role.",
    },
    {
        q: "What happens at the end?",
        a: "The interviewer closes with spoken feedback on how it went and what to work on next.",
    },
];

export function Faq() {
    return (
        <section id="faq" className="scroll-mt-16 border-t py-24 sm:py-32">
            <div className="page-container grid gap-12 lg:grid-cols-12 lg:gap-16">
                <div className="lg:col-span-4">
                    <p className="label-mono text-muted-foreground">FAQ</p>
                    <h2 className="text-h2 mt-4">Questions, answered.</h2>
                </div>

                <m.div className="lg:col-span-8" variants={fadeUp} initial="hidden" whileInView="visible" viewport={inViewOnce}>
                    <Accordion type="single" collapsible defaultValue="item-0" className="border-t">
                        {QUESTIONS.map((item, index) => (
                            <AccordionItem key={item.q} value={`item-${index}`}>
                                <AccordionTrigger>{item.q}</AccordionTrigger>
                                <AccordionContent>{item.a}</AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </m.div>
            </div>
        </section>
    );
}
