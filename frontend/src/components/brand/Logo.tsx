import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
    return (
        <svg
            viewBox="0 0 32 32"
            aria-hidden
            data-animated={animated}
            className={cn("logo-mark size-7 shrink-0", className)}
        >
            <rect width="32" height="32" rx="8" fill="#C6F135" />
            <rect className="logo-bar logo-bar-1" x="7" y="13" width="3.5" height="6" rx="1.75" fill="#151512" />
            <rect className="logo-bar logo-bar-2" x="14.25" y="8" width="3.5" height="16" rx="1.75" fill="#151512" />
            <rect className="logo-bar logo-bar-3" x="21.5" y="11" width="3.5" height="10" rx="1.75" fill="#151512" />
        </svg>
    );
}

export function Logo({ to = "/", className, wordmark = true }: { to?: string; className?: string; wordmark?: boolean }) {
    return (
        <Link to={to} aria-label="AI Interviewer home" className={cn("inline-flex items-center gap-2.5", className)}>
            <LogoMark />
            {wordmark && <span className="font-serif text-[22px] leading-none tracking-tight">AI Interviewer</span>}
        </Link>
    );
}
