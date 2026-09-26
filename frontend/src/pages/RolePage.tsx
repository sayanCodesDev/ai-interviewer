import { ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useStartInterview } from "@/components/landing/useStartInterview";
import { Button } from "@/components/ui/button";
import { FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "@/content/roles.generated";
import { MarketingLayout } from "@/layouts/MarketingLayout";
import { NotFound } from "@/pages/NotFound";

const TOPIC_LABEL: Record<string, string> = {
    array: "Arrays", string: "Strings", "hash-map": "Hash maps", stack: "Stacks", "two-pointers": "Two pointers", graph: "Graphs",
    heap: "Heaps", "dynamic-programming": "Dynamic programming", "sliding-window": "Sliding window", sorting: "Sorting", "binary-search": "Binary search",
};

const SCORED = [
    ["Problem solving", "How you break problems down, pick an approach and handle edge cases."],
    ["Code correctness", "Whether your solutions pass hidden tests, and how many attempts and hints it took."],
    ["Technical depth", "How accurate and deep your answers are, and whether you know the trade-offs."],
    ["Communication", "Whether you think aloud, stay structured and answer the question asked."],
];

export function RolePage() {
    const { slug } = useParams();
    const role = ROLE_CONTENT.find((r) => r.slug === slug);
    const { start, checking } = useStartInterview();
    if (!role) return <NotFound />;

    const others = ROLE_CONTENT.filter((r) => r.slug !== role.slug);

    return (
        <MarketingLayout>
            <article className="page-container py-16 sm:py-24">
                <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
                    <Link to="/" className="hover:text-foreground">Home</Link> <span aria-hidden>/</span>{" "}
                    <Link to="/mock-interviews" className="hover:text-foreground">Mock interviews</Link> <span aria-hidden>/</span>{" "}
                    <span className="text-foreground">{role.role}</span>
                </nav>

                <header className="mt-8 max-w-3xl">
                    <p className="label-mono text-muted-foreground">Mock interview</p>
                    <h1 className="text-h2 mt-4">{role.role} mock interview with an AI interviewer.</h1>
                    <p className="mt-6 text-[17px] leading-relaxed text-muted-foreground">{role.summary} You talk it through out loud, solve problems in a live editor, and finish with a scored report.</p>
                    <Button variant="signal" size="lg" onClick={start} disabled={checking} className="group mt-9">
                        Start a {role.role} interview
                        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Button>
                </header>

                <section className="mt-20 grid gap-12 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                        <h2 className="text-h3">What it covers</h2>
                    </div>
                    <ul className="grid gap-3 lg:col-span-8">
                        {role.focusAreas.map((area) => (
                            <li key={area} className="flex items-start gap-3 border-b pb-3 text-[15px]">
                                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
                                {area}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mt-20 border-t pt-16">
                    <h2 className="text-h3">Questions you might be asked</h2>
                    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                        A sample of the technical questions, with what a strong answer covers. In a real session the interviewer asks a follow-up on what you actually say, and tailors the set to your job description and level.
                    </p>
                    <ol className="mt-10 grid gap-8">
                        {role.sampleQuestions.map((item, index) => (
                            <li key={item.question} className="grid gap-4 sm:grid-cols-[3rem_1fr]">
                                <span className="font-serif text-3xl text-muted-foreground">{index + 1}</span>
                                <div>
                                    <h3 className="text-lg font-medium leading-snug">{item.question}</h3>
                                    <p className="label-mono mt-3 text-muted-foreground">{item.skill}{item.level ? ` · from ${item.level} level` : ""}</p>
                                    <p className="mt-4 text-sm font-medium">A strong answer covers</p>
                                    <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                                        {item.lookFor.map((point) => (
                                            <li key={point} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{point}</li>
                                        ))}
                                    </ul>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="mt-20 border-t pt-16">
                    <h2 className="text-h3">Coding and system design</h2>
                    <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                        The coding rounds draw from {PRODUCT_STATS.problems} problems with hidden tests, in {PRODUCT_STATS.languages.join(", ")}. For {role.role.toLowerCase()} roles the interviewer leans on {role.codingTopics.map((t) => TOPIC_LABEL[t] ?? t).join(", ").toLowerCase()}.
                    </p>
                    {role.designPrompts.length > 0 && (
                        <ul className="mt-8 grid gap-5 md:grid-cols-2">
                            {role.designPrompts.map((d) => (
                                <li key={d.title} className="rounded-xl border bg-card p-6">
                                    <p className="label-mono text-muted-foreground">System design prompt</p>
                                    <h3 className="mt-3 text-[17px] font-medium">{d.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.prompt}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="mt-20 border-t pt-16">
                    <h2 className="text-h3">How you're scored</h2>
                    <dl className="mt-8 grid gap-x-12 gap-y-6 sm:grid-cols-2">
                        {SCORED.map(([name, text]) => (
                            <div key={name}>
                                <dt className="text-[15px] font-medium">{name}</dt>
                                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Your report has a score out of 100, feedback on each part with quotes from what you said, your solutions and a prioritised study plan. It's practice feedback, not a hiring decision.
                    </p>
                </section>

                <section className="mt-20 border-t pt-16">
                    <h2 className="text-h3">Pick a length</h2>
                    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {FORMAT_CONTENT.map((f) => (
                            <li key={f.id}>
                                <p className="font-mono text-xs text-muted-foreground">{f.minutes} minutes</p>
                                <h3 className="mt-2 text-[15px] font-medium">{f.label}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mt-20 border-t pt-16">
                    <h2 className="text-h3">Other roles</h2>
                    <ul className="mt-6 flex flex-wrap gap-3">
                        {others.map((r) => (
                            <li key={r.slug}>
                                <Link to={`/mock-interviews/${r.slug}`} className="inline-block rounded-full border px-4 py-2 text-sm transition-colors hover:border-foreground/40">{r.role}</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            </article>
        </MarketingLayout>
    );
}
