import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();

    // Both icons are always rendered and CSS shows the right one, so server-rendered HTML matches the
    // client whatever theme the visitor's browser chose.
    return (
        <Button variant="ghost" size="icon" className={className} onClick={toggleTheme} aria-label="Switch theme" title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <Moon className="dark:hidden" />
            <Sun className="hidden dark:block" />
        </Button>
    );
}
