import { m } from "motion/react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FAQ as QUESTIONS } from "@/content/faq";
import { fadeUp, inViewOnce } from "@/lib/motion";


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
