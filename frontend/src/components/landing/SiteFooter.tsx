import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";

export function SiteFooter() {
    return (
        <footer className="border-t">
            <div className="page-container flex flex-col gap-8 py-10 sm:flex-row sm:items-center sm:justify-between">
                <Logo />

                <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
                    <a href="#how-it-works" className="transition-colors hover:text-foreground">
                        How it works
                    </a>
                    <a href="#features" className="transition-colors hover:text-foreground">
                        Features
                    </a>
                    <a href="#faq" className="transition-colors hover:text-foreground">
                        FAQ
                    </a>
                    <Link to="/signin" className="transition-colors hover:text-foreground">
                        Sign in
                    </Link>
                </nav>

                <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Sayan Ojha</p>
            </div>
        </footer>
    );
}
