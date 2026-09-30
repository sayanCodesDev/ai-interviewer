import { ArrowRight } from "lucide-react";
import { m } from "motion/react";
import { Link } from "react-router-dom";

import { ROLE_CONTENT, type RoleContent } from "@/content/roles.generated";
import { fadeUp, inViewOnce, stagger } from "@/lib/motion";

/** A representative spread, not the full 15 — the point is to show real content exists, not to list every role. */
const FEATURED_SLUGS = ["sde-1", "sde-2", "frontend-engineer", "backend-engineer", "full-stack-developer", "forward-deployed-engineer"];

function featuredRoles(): RoleContent[] {
    const bySlug = new Map(ROLE_CONTENT.map((role) => [role.slug, role]));
    return FEATURED_SLUGS.map((slug) => bySlug.get(slug)).filter((role): role is RoleContent => Boolean(role));
}

/** A look at real mock-interview pages, so a visitor can see what the loop for their own role covers before starting one. */
export function MockInterviews() {
    const roles = featuredRoles();
    if (roles.length === 0) return null;

    return (
        <section className="py-24 sm:py-32">
            <div className="page-container">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <div className="max-w-2xl">
                        <p className="label-mono text-muted-foreground">Mock interviews</p>
                        <h2 className="text-h2 mt-4">See the interview before you take it.</h2>
                        <p className="text-lede mt-5 max-w-xl text-muted-foreground">
                            Each role has its own loop: sample questions, coding topics and what a strong answer covers.
                        </p>
                    </div>
                    <Link to="/mock-interviews" className="group inline-flex shrink-0 items-center gap-2 text-sm font-medium">
                        See all roles
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>

                <m.ul
                    className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    variants={stagger(0.08)}
                    initial="hidden"
                    whileInView="visible"
                    viewport={inViewOnce}
                >
                    {roles.map((role) => (
                        <m.li key={role.slug} variants={fadeUp}>
                            <Link
                                to={`/mock-interviews/${role.slug}`}
                                className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-foreground/40"
                            >
                                <h3 className="text-[19px] font-medium">{role.role}</h3>
                                <p className="mt-2 flex-1 text-[16px] leading-relaxed text-muted-foreground">{role.summary}</p>
                                <p className="mt-4 flex flex-wrap gap-1.5">
                                    {role.focusAreas.slice(0, 2).map((area) => (
                                        <span key={area} className="rounded-full border px-2.5 py-1 text-[13.5px] text-muted-foreground">
                                            {area}
                                        </span>
                                    ))}
                                </p>
                                <span className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium">
                                    See the interview
                                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        </m.li>
                    ))}
                </m.ul>
            </div>
        </section>
    );
}
