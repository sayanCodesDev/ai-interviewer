import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { ROLE_CONTENT } from "@/content/roles.generated";

const PRODUCT = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#features", label: "Features" },
    { href: "/#formats", label: "Formats" },
    { href: "/#report", label: "The report" },
    { href: "/#faq", label: "FAQ" },
];

function Column({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <p className="label-mono text-muted-foreground">{title}</p>
            <ul className="mt-5 grid gap-3 text-[15.5px]">{children}</ul>
        </div>
    );
}

const linkClass = "text-muted-foreground transition-colors hover:text-foreground";

export function SiteFooter() {
    return (
        <footer className="border-t">
            <div className="page-container grid gap-12 py-16 lg:grid-cols-12">
                <div className="lg:col-span-4">
                    <Logo />
                    <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-muted-foreground">
                        Intervyu is an AI mock interviewer for software engineers: practise out loud, code against real tests, sketch system designs and get
                        a scored report with a plan for what to work on.
                    </p>
                </div>

                <nav aria-label="Footer" className="grid gap-10 sm:grid-cols-[auto_1fr_auto] sm:gap-14 lg:col-span-8">
                    <Column title="Product">
                        {PRODUCT.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className={linkClass}>{link.label}</a>
                            </li>
                        ))}
                    </Column>
                    <div>
                        <p className="label-mono text-muted-foreground">
                            <Link to="/mock-interviews" className="transition-colors hover:text-foreground">Mock interviews</Link>
                        </p>
                        <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[15.5px] sm:gap-x-8">
                            {ROLE_CONTENT.map((role) => (
                                <li key={role.slug}>
                                    <Link to={`/mock-interviews/${role.slug}`} className={linkClass}>{role.role}</Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Column title="Intervyu">
                        <li><Link to="/signup" className={linkClass}>Create an account</Link></li>
                        <li><Link to="/signin" className={linkClass}>Sign in</Link></li>
                        <li><Link to="/privacy" className={linkClass}>Privacy</Link></li>
                        <li><Link to="/terms" className={linkClass}>Terms</Link></li>
                    </Column>
                </nav>
            </div>
            <div className="border-t">
                <div className="page-container flex flex-wrap justify-between gap-3 py-7 text-[14.5px] text-muted-foreground">
                    <span>
                        © <time suppressHydrationWarning>{new Date().getFullYear()}</time> Intervyu · Sayan Ojha
                    </span>
                    <span>AI practice feedback, not a hiring decision.</span>
                </div>
            </div>
        </footer>
    );
}
