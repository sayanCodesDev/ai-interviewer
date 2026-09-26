import type { Monaco } from "@monaco-editor/react";

export const MONACO_THEME_NIGHT = "interviewer-night";
export const MONACO_THEME_PAPER = "interviewer-paper";

/** Registers two editor themes built from the app's palettes, so the editor matches the room around it. */
export function defineInterviewerThemes(monaco: Monaco) {
    monaco.editor.defineTheme(MONACO_THEME_NIGHT, {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "8F8D84", fontStyle: "italic" },
            { token: "keyword", foreground: "C6F135" },
            { token: "keyword.control", foreground: "C6F135" },
            { token: "storage", foreground: "C6F135" },
            { token: "string", foreground: "E3C78A" },
            { token: "number", foreground: "F0A36B" },
            { token: "type", foreground: "B9D7EA" },
            { token: "type.identifier", foreground: "B9D7EA" },
            { token: "delimiter", foreground: "9A988F" },
            { token: "operator", foreground: "9A988F" },
        ],
        colors: {
            "editor.background": "#0B0B0A",
            "editor.foreground": "#F2F0EA",
            "editorLineNumber.foreground": "#4A4943",
            "editorLineNumber.activeForeground": "#9A988F",
            "editor.lineHighlightBackground": "#12120F",
            "editor.lineHighlightBorder": "#00000000",
            "editor.selectionBackground": "#C6F13533",
            "editor.inactiveSelectionBackground": "#C6F13520",
            "editorCursor.foreground": "#C6F135",
            "editorIndentGuide.background1": "#22221D",
            "editorIndentGuide.activeBackground1": "#3A3A33",
            "editorWhitespace.foreground": "#2A2A25",
            "editorWidget.background": "#161613",
            "editorWidget.border": "#2A2A25",
            "editorSuggestWidget.background": "#161613",
            "editorSuggestWidget.border": "#2A2A25",
            "editorSuggestWidget.selectedBackground": "#23231F",
            "editorBracketMatch.background": "#C6F13522",
            "editorBracketMatch.border": "#C6F13566",
            "scrollbarSlider.background": "#2A2A2566",
            "scrollbarSlider.hoverBackground": "#3A3A3388",
            "scrollbarSlider.activeBackground": "#4A494388",
        },
    });

    monaco.editor.defineTheme(MONACO_THEME_PAPER, {
        base: "vs",
        inherit: true,
        rules: [
            { token: "comment", foreground: "77756C", fontStyle: "italic" },
            { token: "keyword", foreground: "3F6B00" },
            { token: "string", foreground: "8A5A00" },
            { token: "number", foreground: "B5470D" },
            { token: "type", foreground: "1D5C8A" },
        ],
        colors: {
            "editor.background": "#FBFAF6",
            "editor.foreground": "#151512",
            "editorLineNumber.foreground": "#B5B2A6",
            "editorLineNumber.activeForeground": "#6B6A63",
            "editor.lineHighlightBackground": "#F1EFE8",
            "editor.lineHighlightBorder": "#00000000",
            "editor.selectionBackground": "#C6F13566",
            "editorCursor.foreground": "#151512",
            "editorIndentGuide.background1": "#E7E4DA",
            "editorWidget.background": "#FFFFFF",
            "editorWidget.border": "#E3E0D7",
        },
    });
}
