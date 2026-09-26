import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { FORMAT_CONTENT, PRODUCT_STATS, ROLE_CONTENT } from "@/content/roles.generated";
import { MarketingLayout } from "@/layouts/MarketingLayout";

export function RolesIndex() {
    return (
        <MarketingLayout>
            <div className="page-container py-16 sm:py-24">
                <p className="label-mono text-muted-foreground">Mock interviews</p>
                <h1 className="text-h2 mt-4 max-w-3xl">Practise the interview for the role you actually want.</h1>
                <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
                    Every interview is a real loop: an introduction, questions about your background, live coding problems with hidden tests, technical questions, a behavioral round and time for your own questions. Pick a role to see what it covers.
                </p>

                <ul className="mt-14 grid gap-4 md:grid-cols-2">
                    {ROLE_CONTENT.map((role) => (
                        <li key={role.slug}>
                            <Link to={`/mock-interviews/${role.slug}`} className="group flex h-full flex-col rounded-2xl border bg-card p-7 transition-colors hover:border-foreground/40">
                                <h2 className="text-h3">{role.role}</h2>
                                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted-foreground">{role.summary}</p>
                                <p className="mt-5 flex flex-wrap gap-2">
                                    {role.focusAreas.slice(0, 3).map((area) => (
                                        <span key={area} className="rounded-full border px-3 py-1 text-[13px] text-muted-foreground">{area}</span>
                                    ))}
                                </p>
                                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium">
                                    See the interview <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>

                <section className="mt-24 border-t pt-16">
                    <h2 className="text-h3">Choose how long to spend.</h2>
                    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {FORMAT_CONTENT.map((format) => (
                            <li key={format.id}>
                                <p className="font-mono text-xs text-muted-foreground">{format.minutes} minutes</p>
                                <h3 className="mt-2 text-[15px] font-medium">{format.label}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{format.description}</p>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-10 text-sm text-muted-foreground">
                        {PRODUCT_STATS.problems} coding problems, each with hidden tests, in {PRODUCT_STATS.languages.join(", ")}.
                    </p>
                </section>
            </div>
        </MarketingLayout>
    );
}
