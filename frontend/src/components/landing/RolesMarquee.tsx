import { Link } from "react-router-dom";

import { ROLE_CONTENT } from "@/content/roles.generated";

/**
 * Every role there is a mock interview for, drifting past. Each is a real link to that role's page. The list is
 * written twice so the loop is seamless; the copy is hidden from assistive tech and search, and the drift stops
 * on hover, on keyboard focus and under reduced motion.
 */
export function RolesMarquee() {
    const roles = ROLE_CONTENT.map((role) => ({ slug: role.slug, name: role.role }));

    const row = (copy: boolean) => (
        <ul aria-hidden={copy || undefined} className="flex shrink-0 items-center gap-10 pr-10">
            {roles.map((role) => (
                <li key={role.slug} className="flex items-center gap-10">
                    <Link
                        to={`/mock-interviews/${role.slug}`}
                        tabIndex={copy ? -1 : undefined}
                        className="font-serif text-[clamp(1.6rem,1.2rem+1.4vw,2.4rem)] leading-none tracking-tight whitespace-nowrap text-muted-foreground transition-colors duration-300 hover:text-foreground"
                    >
                        {role.name}
                    </Link>
                    <span aria-hidden className="size-1.5 rounded-full bg-signal" />
                </li>
            ))}
        </ul>
    );

    return (
        <section aria-labelledby="roles-marquee-label" className="border-y py-10 sm:py-12">
            <div className="page-container">
                <p id="roles-marquee-label" className="label-mono text-muted-foreground">
                    Mock interviews by role
                </p>
            </div>
            <div className="group mt-7 flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
                <div className="flex animate-marquee group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
                    {row(false)}
                    {row(true)}
                </div>
            </div>
        </section>
    );
}
