import { TooltipProvider } from "@/components/ui/tooltip";
import { useForcedTheme } from "@/context/ThemeContext";

/** The interview room is always dark, like a call app, so portals (menus, dialogs, toasts) match it too. */
export function InterviewLayout({ children }: { children: React.ReactNode }) {
    useForcedTheme("dark");

    return (
        <TooltipProvider>
            <div className="relative flex h-dvh flex-col overflow-hidden bg-night text-night-foreground">{children}</div>
        </TooltipProvider>
    );
}
