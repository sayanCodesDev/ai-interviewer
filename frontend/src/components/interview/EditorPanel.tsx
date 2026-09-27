import Editor, { type OnMount } from "@monaco-editor/react";
import { ArrowLeft, Check, Play, RotateCw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EditorSettings } from "@/components/interview/EditorSettings";
import { ProblemPane } from "@/components/interview/ProblemPane";
import { TestPanel } from "@/components/interview/TestPanel";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clearDraft, loadDraft, saveDraft, useEditorPrefs } from "@/hooks/useEditorPrefs";
import { formatClock } from "@/hooks/useElapsed";
import { apiErrorMessage } from "@/lib/api";
import { runCode } from "@/lib/interviews";
import "@/lib/monaco-setup";
import { MONACO_THEME_NIGHT, MONACO_THEME_PAPER, defineInterviewerThemes } from "@/lib/monaco-theme";
import { LANGUAGES, type Language, type PublicProblem, type TestRun } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONSOLE_MIN = 120;
const CONSOLE_MAX = 520;
const clampConsole = (height: number) => Math.max(CONSOLE_MIN, Math.min(CONSOLE_MAX, height));

const LANGUAGE_KEY = "editor:language";

function initialLanguage(preferred: string): Language {
    try {
        const saved = localStorage.getItem(LANGUAGE_KEY);
        if (LANGUAGES.some((l) => l.value === saved)) return saved as Language;
    } catch {
        /* ignore */
    }
    return LANGUAGES.some((l) => l.value === preferred) ? (preferred as Language) : "javascript";
}

interface EditorPanelProps {
    interviewId: string;
    mode: "code" | "notes";
    problem?: PublicProblem;
    title: string;
    prompt: string;
    problemNumber: number;
    problemTotal: number;
    /** The last graded submission for this problem, delivered by the interviewer's server. */
    submitResult: TestRun | null;
    /** True from sending a submission until its result arrives. */
    submitting: boolean;
    onSubmitCode: (code: string, language: Language) => boolean;
    onSubmitNotes: (text: string) => boolean;
    onClose: () => void;
    /** "sheet" is the full-screen mobile presentation, which also carries the problem statement. */
    layout?: "split" | "sheet";
    /** The language the candidate works in, as far as their GitHub and resume show. Used unless they have chosen one themselves. */
    preferredLanguage?: string;
    /** Told what is in the editor after the candidate has paused typing, so the interviewer can see it as a person would. */
    onCodeSnapshot?: (code: string, language: Language) => void;
}

/** How long typing must pause before the code is shared, and the least time between two shares. */
const SNAPSHOT_QUIET_MS = 5_000;
const SNAPSHOT_MIN_GAP_MS = 15_000;

export function EditorPanel({ interviewId, mode, problem, title, prompt, problemNumber, problemTotal, submitResult, submitting, onSubmitCode, onSubmitNotes, onClose, layout = "split", preferredLanguage = "javascript", onCodeSnapshot }: EditorPanelProps) {
    const notesMode = mode === "notes";
    const [prefs, updatePrefs] = useEditorPrefs();
    const [language, setLanguage] = useState<Language>(() => initialLanguage(preferredLanguage));
    const draftKey = (lang: string) => `draft:${interviewId}:${problem?.key ?? "notes"}:${lang}`;
    const starter = useCallback((lang: Language) => (notesMode ? "# Design notes\n\n- Requirements\n- Components\n- Data model\n- Scaling and failure\n- Trade-offs\n" : (problem?.starter[lang] ?? "")), [notesMode, problem]);

    const [code, setCode] = useState(() => loadDraft(draftKey(language)) ?? starter(language));
    const codeRef = useRef(code);
    codeRef.current = code;

    const [runResult, setRunResult] = useState<TestRun | null>(null);
    const [customResult, setCustomResult] = useState<TestRun | null>(null);
    const [running, setRunning] = useState(false);
    const [customRunning, setCustomRunning] = useState(false);
    const [codeVersion, setCodeVersion] = useState(0);
    const [resultVersion, setResultVersion] = useState(0);
    const [consoleHeight, setConsoleHeight] = useState(240);
    const [elapsed, setElapsed] = useState(0);
    const [showProblem, setShowProblem] = useState(layout === "sheet");
    const drag = useRef<{ startY: number; startHeight: number } | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Monaco loads its own runtime from our origin after this component mounts (see monaco-setup.ts). If
    // that ever stalls — a network hiccup, a blocking extension, a stale cache — `onMount` below never
    // fires and `<Editor>`'s own `loading` fallback would sit there forever with no way out. Give it a
    // window, then offer a real retry instead of a silent stuck skeleton.
    const [loadState, setLoadState] = useState<"loading" | "ready" | "stuck">("loading");
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        if (loadState !== "loading") return;
        const timer = setTimeout(() => setLoadState((state) => (state === "loading" ? "stuck" : state)), 12_000);
        return () => clearTimeout(timer);
    }, [loadState, retryKey]);
    const retryLoad = useCallback(() => {
        setLoadState("loading");
        setRetryKey((key) => key + 1);
    }, []);

    // Per-problem timer: neutral, then amber at 15 minutes and red at 25.
    useEffect(() => {
        const id = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
        return () => clearInterval(id);
    }, []);
    const timerTone = elapsed >= 1500 ? "text-night-red" : elapsed >= 900 ? "text-night-amber" : "text-night-muted";

    // Share the code with the interviewer when typing pauses. Unchanged code and the untouched starter are not worth sending.
    const lastShared = useRef({ code: "", at: 0 });
    const snapshotCallback = useRef(onCodeSnapshot);
    snapshotCallback.current = onCodeSnapshot;
    useEffect(() => {
        if (notesMode || !problem || !snapshotCallback.current) return;
        if (code === lastShared.current.code || code === starter(language)) return;
        const wait = Math.max(SNAPSHOT_QUIET_MS, lastShared.current.at + SNAPSHOT_MIN_GAP_MS - Date.now());
        const timer = setTimeout(() => {
            lastShared.current = { code: codeRef.current, at: Date.now() };
            snapshotCallback.current?.(codeRef.current, language);
        }, wait);
        return () => clearTimeout(timer);
    }, [code, language, notesMode, problem, starter]);

    // Keep drafts: they survive a refresh, and each language keeps its own.
    const persist = useCallback((value: string, lang: Language) => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveDraft(draftKey(lang), value), 400);
    }, [interviewId, problem?.key]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => () => clearTimeout(saveTimer.current), []);

    function handleLanguageChange(next: Language) {
        saveDraft(draftKey(language), codeRef.current);
        setLanguage(next);
        try {
            localStorage.setItem(LANGUAGE_KEY, next);
        } catch {
            /* ignore */
        }
        setCode(loadDraft(draftKey(next)) ?? starter(next));
        setRunResult(null);
        setCustomResult(null);
    }

    function handleChange(value: string | undefined) {
        const next = value ?? "";
        setCode(next);
        setCodeVersion((v) => v + 1);
        persist(next, language);
    }

    function resetCode() {
        clearDraft(draftKey(language));
        setCode(starter(language));
        toast("Reset to the starter code.");
    }

    const runExamples = useCallback(async () => {
        if (!problem || running) return;
        setRunning(true);
        try {
            setRunResult(await runCode(interviewId, { problemKey: problem.key, language, code: codeRef.current, mode: "examples" }));
            setResultVersion(codeVersion);
        } catch (error) {
            toast.error(apiErrorMessage(error, "We couldn't run your code. Try again."));
        } finally {
            setRunning(false);
        }
    }, [problem, running, interviewId, language, codeVersion]);

    async function runCustom(args: unknown[]) {
        if (!problem) return;
        setCustomRunning(true);
        try {
            setCustomResult(await runCode(interviewId, { problemKey: problem.key, language, code: codeRef.current, mode: "custom", args }));
        } catch (error) {
            toast.error(apiErrorMessage(error, "We couldn't run your code. Try again."));
        } finally {
            setCustomRunning(false);
        }
    }

    const submit = useCallback(() => {
        if (submitting) return;
        const delivered = notesMode ? onSubmitNotes(codeRef.current) : onSubmitCode(codeRef.current, language);
        if (!delivered) toast.error("We couldn't reach your interviewer. Check your connection and try again.");
        else if (notesMode) toast.success("Notes shared with your interviewer.");
    }, [submitting, notesMode, onSubmitNotes, onSubmitCode, language]);

    // Keyboard: Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter submits. Registered inside Monaco so it works while typing.
    const handlersRef = useRef({ run: runExamples, submit });
    handlersRef.current = { run: runExamples, submit };
    const onMount: OnMount = (editor, monaco) => {
        setLoadState("ready");
        void document.fonts.ready.then(() => monaco.editor.remeasureFonts());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { if (!notesMode) void handlersRef.current.run(); });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => handlersRef.current.submit());
    };

    const languageInfo = LANGUAGES.find((l) => l.value === language)!;
    const editorLanguage = notesMode ? "markdown" : languageInfo.monaco;
    const stale = useMemo(() => resultVersion !== codeVersion, [resultVersion, codeVersion]);

    const closeButton = (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide editor">
                    <X />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Hide the editor. The problem stays open.</TooltipContent>
        </Tooltip>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-night-line bg-night-sunken">
            {layout === "sheet" && (
                <div className="border-b border-night-line">
                    <div className="flex items-center px-2 py-2">
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <ArrowLeft />
                            Back to conversation
                        </Button>
                        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setShowProblem((v) => !v)} aria-expanded={showProblem}>
                            {showProblem ? "Hide problem" : "Show problem"}
                        </Button>
                    </div>
                    {showProblem && <ProblemPane problem={problem} fallbackText={prompt} title={title} number={problemNumber} total={problemTotal} className="max-h-56 rounded-none border-0 border-t" />}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 border-b border-night-line px-3 py-2.5 sm:px-4">
                {notesMode ? (
                    <span className="label-mono text-night-muted">Design notes</span>
                ) : (
                    <Select value={language} onValueChange={(value) => handleLanguageChange(value as Language)}>
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
                )}

                <span className={cn("font-mono text-[13px] tabular-nums transition-colors duration-500", timerTone)} aria-label="Time on this problem">
                    {formatClock(elapsed)}
                </span>

                <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                    <EditorSettings prefs={prefs} onChange={updatePrefs} onResetCode={resetCode} />
                    {!notesMode && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => void runExamples()} disabled={running}>
                                    {running ? <Spinner /> : <Play />}
                                    Run
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Run the examples <Kbd>⌘</Kbd> <Kbd>↵</Kbd></TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="signal" size="sm" onClick={submit} disabled={submitting}>
                                {submitting ? <Spinner /> : submitResult && !notesMode && !stale ? <Check /> : null}
                                {notesMode ? "Share notes" : "Submit"}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{notesMode ? "Send your notes to the interviewer" : "Grade against every test and tell the interviewer"} <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>↵</Kbd></TooltipContent>
                    </Tooltip>
                    {layout === "split" && closeButton}
                </div>
            </div>

            <div className="relative min-h-[160px] flex-1">
                {loadState === "stuck" && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-night-sunken px-6 text-center">
                        <TriangleAlert className="size-5 text-night-amber" aria-hidden="true" />
                        <p className="text-[14px] text-night-foreground">The code editor is taking too long to load.</p>
                        <p className="max-w-xs text-[13px] text-night-muted">This is usually a slow or interrupted connection. Your answer isn't lost — you can keep talking, or try again.</p>
                        <Button variant="outline" size="sm" onClick={retryLoad}>
                            <RotateCw /> Retry
                        </Button>
                    </div>
                )}
                <Editor
                    key={retryKey}
                    height="100%"
                    language={editorLanguage}
                    path={`${interviewId}/${problem?.key ?? "notes"}.${language}`}
                    theme={prefs.theme === "paper" ? MONACO_THEME_PAPER : MONACO_THEME_NIGHT}
                    value={code}
                    onChange={handleChange}
                    beforeMount={defineInterviewerThemes}
                    onMount={onMount}
                    loading={<Skeleton className="m-4 h-6 w-1/2" />}
                    options={{
                        fontFamily: "'Geist Mono Variable', ui-monospace, Menlo, monospace",
                        fontSize: prefs.fontSize,
                        lineHeight: Math.round(prefs.fontSize * 1.6),
                        minimap: { enabled: prefs.minimap },
                        wordWrap: prefs.wordWrap ? "on" : "off",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: prefs.tabSize,
                        insertSpaces: true,
                        padding: { top: 16, bottom: 16 },
                        renderLineHighlight: "line",
                        cursorBlinking: "smooth",
                        smoothScrolling: true,
                        overviewRulerBorder: false,
                        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                        bracketPairColorization: { enabled: true },
                        guides: { bracketPairs: true, indentation: true },
                        stickyScroll: { enabled: !notesMode },
                        autoClosingBrackets: "always",
                        autoClosingQuotes: "always",
                        autoIndent: "full",
                        formatOnPaste: true,
                        formatOnType: true,
                        quickSuggestions: notesMode ? false : { other: true, comments: false, strings: false },
                        suggestOnTriggerCharacters: !notesMode,
                        wordBasedSuggestions: "currentDocument",
                        parameterHints: { enabled: !notesMode },
                        tabCompletion: "on",
                        snippetSuggestions: "inline",
                        matchBrackets: "always",
                        renderWhitespace: "selection",
                        accessibilitySupport: "auto",
                        ariaLabel: notesMode ? "Design notes" : "Code editor",
                    }}
                />
            </div>

            {!notesMode && problem && (
                <div style={{ height: consoleHeight }} className="flex shrink-0 flex-col border-t border-night-line bg-night-sunken">
                    <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Resize results panel"
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
                        onPointerUp={() => { drag.current = null; }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowUp") { event.preventDefault(); setConsoleHeight((h) => clampConsole(h + 24)); }
                            else if (event.key === "ArrowDown") { event.preventDefault(); setConsoleHeight((h) => clampConsole(h - 24)); }
                        }}
                        className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none"
                    >
                        <span className="h-1 w-10 rounded-full bg-night-line transition-colors group-hover:bg-night-muted group-focus-visible:bg-signal" />
                    </div>
                    <TestPanel
                        problem={problem}
                        runResult={runResult}
                        submitResult={submitResult}
                        running={running}
                        submitting={submitting}
                        customResult={customResult}
                        customRunning={customRunning}
                        onRunCustom={(args) => void runCustom(args)}
                        stale={stale}
                    />
                </div>
            )}
        </div>
    );
}
