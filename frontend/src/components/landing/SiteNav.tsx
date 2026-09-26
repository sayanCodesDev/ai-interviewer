import { Menu, X } from "lucide-react";
import { AnimatePresence, m, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { useStartInterview } from "@/components/landing/useStartInterview";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/context/AuthContext";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { cn } from "@/lib/utils";

const LINKS = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#features", label: "Features" },
    { href: "/mock-interviews", label: "Mock interviews" },
    { href: "/#faq", label: "FAQ" },
];

export function SiteNav() {
    const { status } = useAuth();
    const { start, checking } = useStartInterview();
    const { scrollY } = useScroll();
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);

    useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 24));

    const solid = scrolled || open;

    return (
        <header
            className={cn(
                "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color] duration-300",
                solid ? "border-border bg-background" : "border-transparent bg-transparent",
            )}
        >
            <div
                className={cn(
                    "page-container flex items-center justify-between transition-[height] duration-300 ease-out-expo",
                    scrolled ? "h-[60px]" : "h-[72px]",
                )}
            >
                <Logo />

                <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
                    {LINKS.map((link) => (
                        <a key={link.href} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <div className="hidden items-center gap-2 md:flex">
                        {status === "authenticated" && <UserMenu />}
                        {status === "unauthenticated" && (
                            <Button asChild variant="ghost">
                                <Link to="/signin">Sign in</Link>
                            </Button>
                        )}
                        <Button variant="signal" onClick={start} disabled={checking}>
                            Start interview
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setOpen((current) => !current)}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        aria-label={open ? "Close menu" : "Open menu"}
                    >
                        {open ? <X /> : <Menu />}
                    </Button>
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <m.div
                        id="mobile-menu"
                        className="overflow-hidden border-t bg-background md:hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                    >
                        <div className="page-container grid gap-1 py-4">
                            {LINKS.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setOpen(false)}
                                    className="rounded-md px-1 py-3 text-lg font-medium tracking-tight"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <div className="mt-3 grid gap-3">
                                <Button
                                    variant="signal"
                                    size="lg"
                                    onClick={() => {
                                        setOpen(false);
                                        void start();
                                    }}
                                    disabled={checking}
                                >
                                    Start interview
                                </Button>
                                {status === "unauthenticated" && (
                                    <Button asChild variant="outline" size="lg">
                                        <Link to="/signin">Sign in</Link>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </header>
    );
}
