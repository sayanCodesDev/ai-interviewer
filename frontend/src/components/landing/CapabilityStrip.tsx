import { m } from "motion/react";

import { fadeUp, inViewOnce, stagger } from "@/lib/motion";

const ITEMS = [
    { title: "Voice conversation", text: "Talk it through out loud." },
    { title: "Live code editor", text: "Run and submit in the browser." },
    { title: "Reads your GitHub", text: "Optional, to tailor the questions." },
    { title: "Five languages", text: "JavaScript, TypeScript, Python, C++, Java." },
];

export function CapabilityStrip() {
    return (
        <section aria-label="Highlights" className="border-y">
            <div className="page-container">
                <m.ul
                    className="grid grid-cols-2 gap-px bg-border md:grid-cols-4"
                    variants={stagger(0.08)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    {ITEMS.map((item, index) => (
                        <m.li
                            key={item.title}
                            variants={fadeUp}
                            className="bg-background px-5 py-7 max-md:odd:pl-0 max-md:even:pr-0 md:first:pl-0 md:last:pr-0"
                        >
                            <p className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                            <h2 className="mt-3 text-[15px] font-medium">{item.title}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                        </m.li>
                    ))}
                </m.ul>
            </div>
        </section>
    );
}
