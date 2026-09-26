import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";

export function SiteFooter() {
    return (
        <footer className="border-t">
            <div className="page-container grid gap-10 py-12 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                    <Logo />
                    <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        Practise technical interviews out loud with an AI interviewer, then get a scored report and a plan for what to work on.
                    </p>
                </div>

                <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 gap-y-3 text-sm text-muted-foreground sm:grid-cols-3">
                    <a href="/#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
                    <a href="/#features" className="transition-colors hover:text-foreground">Features</a>
                    <a href="/#faq" className="transition-colors hover:text-foreground">FAQ</a>
                    <Link to="/mock-interviews" className="transition-colors hover:text-foreground">Mock interviews</Link>
                    <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
                    <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
                    <Link to="/signin" className="transition-colors hover:text-foreground">Sign in</Link>
                </nav>
            </div>
            <div className="page-container border-t py-6 text-[13px] text-muted-foreground">
                © <time suppressHydrationWarning>{new Date().getFullYear()}</time> Sayan Ojha
            </div>
        </footer>
    );
}
