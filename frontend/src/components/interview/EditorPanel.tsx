import Editor from "@monaco-editor/react";
import { ArrowLeft, Check, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClock } from "@/hooks/useElapsed";
import { BACKEND_URL } from "@/lib/config";
import { defineInterviewerTheme, MONACO_THEME } from "@/lib/monaco-theme";
import { cn } from "@/lib/utils";

const LANGUAGES = [
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "python", label: "Python" },
    { value: "cpp", label: "C++" },
    { value: "java", label: "Java" },
];

const DEFAULT_CODE_STARTERS: Record<string, string> = {
    javascript: `function solution() {
  // Write your solution here

}`,
    typescript: `function solution(): void {
  // Write your solution here

}`,
    python: `def solution():
    # Write your solution here
    pass`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your solution here

    return 0;
}`,
    java: `public class Solution {
    public static void main(String[] args) {
        // Write your solution here
    }
}`,
};

const getStarter = (language: string) => DEFAULT_CODE_STARTERS[language] ?? DEFAULT_CODE_STARTERS.javascript!;

const CONSOLE_MIN = 72;
const CONSOLE_MAX = 420;
const clampConsole = (height: number) => Math.max(CONSOLE_MIN, Math.min(CONSOLE_MAX, height));

interface EditorPanelProps {
    initialLanguage: string;
    question: string;
    problemNumber: number;
    /** False until the candidate has submitted the current problem. */
    canClose: boolean;
    onClose: () => void;
    /** Returns false when the code could not be delivered to the interviewer. */
    onSubmit: (code: string, language: string) => boolean;
    /** "sheet" is the full-screen mobile presentation, which also carries the problem statement. */
    layout?: "split" | "sheet";
}

export function EditorPanel({ initialLanguage, question, problemNumber, canClose, onClose, onSubmit, layout = "split" }: EditorPanelProps) {
    const [language, setLanguage] = useState(initialLanguage);
    const [code, setCode] = useState(() => getStarter(initialLanguage));
    const [output, setOutput] = useState("Terminal ready. Run your code to see the output here.");
    const [isRunning, setIsRunning] = useState(false);
    const [consoleHeight, setConsoleHeight] = useState(144);
    const [elapsed, setElapsed] = useState(0);
    const [timerRunning, setTimerRunning] = useState(true);
    const [justSubmitted, setJustSubmitted] = useState(false);
    const drag = useRef<{ startY: number; startHeight: number } | null>(null);

    useEffect(() => {
        if (!timerRunning) return;
        const id = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
        return () => clearInterval(id);
    }, [timerRunning]);

    useEffect(() => {
        if (!justSubmitted) return;
        const id = setTimeout(() => setJustSubmitted(false), 2000);
        return () => clearTimeout(id);
    }, [justSubmitted]);

    const timerTone = elapsed >= 600 ? "text-night-red" : elapsed >= 300 ? "text-night-amber" : "text-night-muted";

    function handleLanguageChange(next: string) {
        setLanguage(next);
        setCode(getStarter(next));
    }

    async function handleRun() {
        setIsRunning(true);
        setOutput("Running your code…");
        try {
            // The execution endpoint is authenticated; send the same credentials axios does.
            const token = localStorage.getItem("token");
            const response = await fetch(`${BACKEND_URL}/api/execute-code`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ code, language }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setOutput(data.output || data.msg || `Execution failed (${response.status}).`);
                return;
            }
            setOutput(data.output || "Code executed cleanly.");
        } catch (error: any) {
            setOutput(`Execution error: ${error.message}`);
        } finally {
            setIsRunning(false);
        }
    }

    function handleSubmit() {
        if (!onSubmit(code, language)) return;
        setTimerRunning(false);
        setJustSubmitted(true);
    }

    const closeButton = (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex" tabIndex={canClose ? undefined : 0}>
                    <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={!canClose} aria-label="Close editor">
                        <X />
                    </Button>
                </span>
            </TooltipTrigger>
            <TooltipContent>{canClose ? "Close editor" : "Submit your code before closing"}</TooltipContent>
        </Tooltip>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-night-line bg-night-sunken">
            {layout === "sheet" && (
                <div className="border-b border-night-line">
                    <div className="flex items-center px-2 py-2">
                        <Button variant="ghost" size="sm" onClick={onClose} disabled={!canClose}>
                            <ArrowLeft />
                            Back to conversation
                        </Button>
                    </div>
                    <details open className="border-t border-night-line px-4 py-3">
                        <summary className="label-mono text-night-muted">{problemNumber ? `Problem ${problemNumber}` : "Problem"}</summary>
                        <ProblemPanel question={question} className="mt-3 max-h-40 border-0 bg-transparent" bare />
                    </details>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 border-b border-night-line px-3 py-2.5 sm:px-4">
                <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger size="sm" aria-label="Language" className="w-[124px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LANGUAGES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <span className={cn("font-mono text-[13px] tabular-nums transition-colors duration-500", timerTone)} aria-label="Time on this problem">
                    {formatClock(elapsed)}
                </span>

                <div className="ml-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleRun} disabled={isRunning}>
                        {isRunning ? <Spinner /> : <Play />}
                        Run
                    </Button>
                    <Button variant="signal" size="sm" onClick={handleSubmit} disabled={justSubmitted}>
                        {justSubmitted ? (
                            <>
                                <Check />
                                Submitted
                            </>
                        ) : (
                            "Submit code"
                        )}
                    </Button>
                    {layout === "split" && closeButton}
                </div>
            </div>

            <div className="min-h-[160px] flex-1">
                <Editor
                    height="100%"
                    language={language}
                    theme={MONACO_THEME}
                    value={code}
                    onChange={(value) => setCode(value ?? "")}
                    beforeMount={defineInterviewerTheme}
                    onMount={(_editor, monaco) => {
                        void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
                    }}
                    loading={<Skeleton className="m-4 h-6 w-1/2" />}
                    options={{
                        fontFamily: "'Geist Mono Variable', ui-monospace, Menlo, monospace",
                        fontSize: 14,
                        lineHeight: 22,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        padding: { top: 16, bottom: 16 },
                        renderLineHighlight: "line",
                        cursorBlinking: "smooth",
                        smoothScrolling: true,
                        overviewRulerBorder: false,
                        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                    }}
                />
            </div>

            <div style={{ height: consoleHeight }} className="flex shrink-0 flex-col border-t border-night-line bg-night-sunken">
                <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize output panel"
                    aria-valuemin={CONSOLE_MIN}
                    aria-valuemax={CONSOLE_MAX}
                    aria-valuenow={consoleHeight}
                    tabIndex={0}
                    onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = { startY: event.clientY, startHeight: consoleHeight };
                    }}
                    onPointerMove={(event) => {
                        if (!drag.current) return;
                        setConsoleHeight(clampConsole(drag.current.startHeight + drag.current.startY - event.clientY));
                    }}
                    onPointerUp={() => {
                        drag.current = null;
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setConsoleHeight((height) => clampConsole(height + 24));
                        } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setConsoleHeight((height) => clampConsole(height - 24));
                        }
                    }}
                    className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none"
                >
                    <span className="h-1 w-10 rounded-full bg-night-line transition-colors group-hover:bg-night-muted group-focus-visible:bg-signal" />
                </div>
                <div className="flex items-center justify-between px-4 pb-2">
                    <span className="label-mono text-night-muted">Output</span>
                    <button type="button" onClick={() => setOutput("")} className="text-xs text-night-muted transition-colors hover:text-night-foreground">
                        Clear
                    </button>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto px-4 pb-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-night-foreground/85">
                    {output || <span className="text-night-muted">Nothing to show.</span>}
                </pre>
            </div>
        </div>
    );
}
