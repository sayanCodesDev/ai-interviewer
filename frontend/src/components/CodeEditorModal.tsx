import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { X, Play, Code2, Check, Loader2, Timer } from "lucide-react";
import { BACKEND_URL } from "../lib/config";

interface CodeEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialLanguage?: string;
    questionPrompt?: string;
    onSubmitCode?: (code: string, language: string) => void;
    onTimerAlert?: () => void;
}

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

export function CodeEditorModal({
    isOpen,
    onClose,
    initialLanguage = "javascript",
    questionPrompt,
    onSubmitCode,
    onTimerAlert
}: CodeEditorModalProps) {
    const [language, setLanguage] = useState<string>(initialLanguage);
    const [terminalHeight, setTerminalHeight] = useState<number>(140);
    const [isRunning, setIsRunning] = useState<boolean>(false);

    const getInitialCode = (lang: string) => {
        return DEFAULT_CODE_STARTERS[lang] || DEFAULT_CODE_STARTERS.javascript || "";
    };

    const [code, setCode] = useState<string>(getInitialCode(initialLanguage));

    const [submitted, setSubmitted] = useState<boolean>(false);
    const [hasSubmitted, setHasSubmitted] = useState<boolean>(false); // permanent gate for close button
    const [output, setOutput] = useState<string | null>("Terminal ready. Click 'Run Code' to execute your code.");

    // Coding timer — counts up from 0 seconds when editor opens
    const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const alertFiredRef = useRef<boolean>(false);

    useEffect(() => {
        // Reset everything when editor opens fresh
        if (isOpen) {
            setElapsedSeconds(0);
            setHasSubmitted(false);
            alertFiredRef.current = false;
            if (initialLanguage) {
                setLanguage(initialLanguage);
                setCode(getInitialCode(initialLanguage));
            }
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen]);

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    const timerColor =
        elapsedSeconds >= 600 ? "text-red-400" :
            elapsedSeconds >= 300 ? "text-amber-400" :
                "text-emerald-400";

    // Fire the 10-minute AI alert exactly once
    useEffect(() => {
        if (elapsedSeconds >= 600 && !alertFiredRef.current && !hasSubmitted) {
            alertFiredRef.current = true;
            if (onTimerAlert) onTimerAlert();
        }
    }, [elapsedSeconds]);

    // When question prompt changes, reset code to starter for the new problem
    useEffect(() => {
        if (questionPrompt) {
            setCode(getInitialCode(language));
            setHasSubmitted(false);
        }
    }, [questionPrompt]);

    if (!isOpen) return null;

    const handleLanguageChange = (newLang: string) => {
        setLanguage(newLang);
        setCode(getInitialCode(newLang));
    };

    const handleRunCode = async () => {
        setIsRunning(true);
        setOutput("Running code on execution engine...");
        try {
            const res = await fetch(`${BACKEND_URL}/api/execute-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, language })
            });
            const data = await res.json();
            setOutput(data.output || "Code executed cleanly.");
        } catch (err: any) {
            setOutput(`Execution Error: ${err.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const handleSubmit = () => {
        setSubmitted(true);
        setHasSubmitted(true); // permanently unlock close button
        if (timerRef.current) {
            clearInterval(timerRef.current); // stop the timer on submit
            timerRef.current = null;
        }
        if (onSubmitCode) {
            onSubmitCode(code, language);
        }
        setTimeout(() => {
            setSubmitted(false);
        }, 2000);
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="w-full h-full flex flex-col bg-[#1e1e2e]/95 dark:bg-[#11111b]/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl overflow-hidden text-slate-100">
                {/* Header Bar */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#181825]/90 border-b border-slate-800 select-none">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                            <Code2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm leading-none text-slate-100">Live Code Workspace</h3>
                            <p className="text-xs text-slate-400 mt-0.5">AI Interviewer requested code implementation</p>
                        </div>
                    </div>

                    {/* Timer Display */}
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 font-mono text-sm font-bold ${timerColor}`}>
                        <Timer className="w-3.5 h-3.5" />
                        <span>{formatTime(elapsedSeconds)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Language Selector */}
                        <select
                            value={language}
                            onChange={(e) => handleLanguageChange(e.target.value)}
                            className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                            <option value="java">Java</option>
                        </select>

                        {/* Close Button — disabled until code is submitted */}
                        <button
                            type="button"
                            onClick={(e) => {
                                if (!hasSubmitted) return;
                                e.stopPropagation();
                                onClose();
                            }}
                            disabled={!hasSubmitted}
                            className={`p-1.5 rounded-lg transition-colors ${hasSubmitted
                                    ? "text-slate-400 hover:text-red-400 hover:bg-slate-800/80 cursor-pointer"
                                    : "text-slate-700 cursor-not-allowed opacity-40"
                                }`}
                            title={hasSubmitted ? "Close Editor" : "Submit your code before closing"}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col relative overflow-hidden">

                    {/* Question Prompt Banner */}
                    {questionPrompt && (
                        <div className="mx-3 mt-3 mb-0 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-4 py-3 shrink-0">
                            <div className="flex items-start gap-2">
                                <span className="text-indigo-400 font-bold text-[10px] uppercase tracking-widest mt-0.5 shrink-0">Question</span>
                                <p className="text-slate-200 text-xs leading-relaxed">{questionPrompt}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 w-full min-h-[200px] mt-2">
                        <Editor
                            height="100%"
                            language={language}
                            theme="vs-dark"
                            value={code}
                            onChange={(val) => setCode(val || "")}
                            options={{
                                fontSize: 14,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                tabSize: 2,
                                padding: { top: 12 }
                            }}
                        />
                    </div>

                    {/* Resizable Console Output Panel */}
                    {output !== null && (
                        <div
                            style={{ height: `${terminalHeight}px` }}
                            className="bg-[#11111b] border-t-2 border-slate-700 flex flex-col relative select-none shrink-0"
                        >
                            {/* Drag Resize Handle Bar */}
                            <div
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    const startY = e.clientY;
                                    const startHeight = terminalHeight;
                                    const onMouseMove = (moveEvent: MouseEvent) => {
                                        const deltaY = startY - moveEvent.clientY;
                                        const newHeight = Math.max(60, Math.min(450, startHeight + deltaY));
                                        setTerminalHeight(newHeight);
                                    };
                                    const onMouseUp = () => {
                                        window.removeEventListener("mousemove", onMouseMove);
                                        window.removeEventListener("mouseup", onMouseUp);
                                    };
                                    window.addEventListener("mousemove", onMouseMove);
                                    window.addEventListener("mouseup", onMouseUp);
                                }}
                                className="w-full h-4 cursor-row-resize bg-slate-800/90 hover:bg-indigo-600/50 transition-colors flex items-center justify-center group z-30"
                                title="Click and drag up/down to resize terminal"
                            >
                                <div className="w-12 h-1.5 bg-slate-400 group-hover:bg-indigo-300 rounded-full transition-colors"></div>
                            </div>

                            <div className="p-3 overflow-y-auto flex-1 font-mono text-xs text-slate-300 bg-[#0d0e15]">
                                <div className="text-indigo-400 font-bold mb-1 flex items-center justify-between border-b border-slate-800 pb-1">
                                    <span>Terminal / Output</span>
                                    <button onClick={() => setOutput("Terminal cleared.")} className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-0.5 rounded">Clear</button>
                                </div>
                                <pre className="whitespace-pre-wrap mt-1">{output}</pre>
                            </div>
                        </div>
                    )}

                    {/* Footer Action Bar */}
                    <div className="flex items-center justify-between px-4 py-3 bg-[#181825]/90 border-t border-slate-800">
                        <button
                            onClick={handleRunCode}
                            disabled={isRunning}
                            className="flex items-center gap-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3.5 py-2 rounded-lg border border-slate-700 transition-colors"
                        >
                            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                            <span>{isRunning ? "Executing..." : "Run Code"}</span>
                        </button>

                        <button
                            onClick={handleSubmit}
                            disabled={submitted}
                            className="flex items-center gap-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-emerald-600 px-4 py-2 rounded-lg shadow-lg transition-colors"
                        >
                            {submitted ? (
                                <>
                                    <Check className="w-3.5 h-3.5" /> Submitted to AI
                                </>
                            ) : (
                                "Submit Code to Interviewer"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
