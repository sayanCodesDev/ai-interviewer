import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
    /** The theme currently applied to the page (a forced theme wins over the user's choice). */
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
    /** Pin the page to one theme until the returned function is called. Used by the interview room. */
    forceTheme: (theme: Theme) => () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredTheme(): Theme | null {
    try {
        const value = localStorage.getItem("theme");
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

function systemTheme(): Theme {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // The inline script in index.html has already applied the right class, so start from it.
    // On the server there is no document; the page renders in the light theme and the inline
    // script in index.html applies the visitor's real theme before first paint.
    const [preferred, setPreferred] = useState<Theme>(() =>
        typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
    const [forced, setForced] = useState<Theme | null>(null);
    const theme = forced ?? preferred;

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
    }, [theme]);

    // Follow the OS setting until the user makes an explicit choice.
    useEffect(() => {
        const query = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            if (!readStoredTheme()) setPreferred(systemTheme());
        };
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const setTheme = useCallback((next: Theme) => {
        setPreferred(next);
        try {
            localStorage.setItem("theme", next);
        } catch {
            // Storage can be unavailable (private mode); the choice still applies for this visit.
        }
    }, []);

    const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);

    const forceTheme = useCallback((next: Theme) => {
        setForced(next);
        return () => setForced(null);
    }, []);

    const value = useMemo(
        () => ({ theme, toggleTheme, setTheme, forceTheme }),
        [theme, toggleTheme, setTheme, forceTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}

/** Pins the page to `theme` while the calling component is mounted. */
export function useForcedTheme(theme: Theme) {
    const { forceTheme } = useTheme();
    useEffect(() => forceTheme(theme), [forceTheme, theme]);
}
