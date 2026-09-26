import { useCallback, useState } from "react";

export interface EditorPrefs {
    fontSize: number;
    tabSize: 2 | 4;
    wordWrap: boolean;
    minimap: boolean;
    theme: "night" | "paper";
}

const KEY = "editor:prefs";
const DEFAULTS: EditorPrefs = { fontSize: 14, tabSize: 4, wordWrap: false, minimap: false, theme: "night" };

function read(): EditorPrefs {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<EditorPrefs>;
        return {
            fontSize: Math.min(22, Math.max(11, Number(parsed.fontSize) || DEFAULTS.fontSize)),
            tabSize: parsed.tabSize === 2 ? 2 : 4,
            wordWrap: parsed.wordWrap === true,
            minimap: parsed.minimap === true,
            theme: parsed.theme === "paper" ? "paper" : "night",
        };
    } catch {
        return DEFAULTS;
    }
}

/** Editor preferences, remembered between problems and sessions. */
export function useEditorPrefs() {
    const [prefs, setPrefs] = useState<EditorPrefs>(read);

    const update = useCallback((patch: Partial<EditorPrefs>) => {
        setPrefs((current) => {
            const next = { ...current, ...patch };
            try {
                localStorage.setItem(KEY, JSON.stringify(next));
            } catch {
                /* the preference still applies for this visit */
            }
            return next;
        });
    }, []);

    return [prefs, update] as const;
}

/** A tiny localStorage-backed draft: survives a refresh, and each problem and language keeps its own code. */
export function loadDraft(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function saveDraft(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* storage full or unavailable: the draft just isn't kept */
    }
}

export function clearDraft(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}
