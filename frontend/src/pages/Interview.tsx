import { loader } from "@monaco-editor/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Tile } from "@/components/audio/Tile";
import { ControlBar } from "@/components/interview/ControlBar";
import { EditorPanel } from "@/components/interview/EditorPanel";
import { EndDialog } from "@/components/interview/EndDialog";
import { FailedState } from "@/components/interview/FailedState";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { TopBar } from "@/components/interview/TopBar";
import { getInitials } from "@/components/UserMenu";
import { useAuth } from "@/context/AuthContext";
import { useElapsed } from "@/hooks/useElapsed";
import { type ServerEvent, useInterviewSession } from "@/hooks/useInterviewSession";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { InterviewLayout } from "@/layouts/InterviewLayout";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { getInterviewRole, recordProblemSubmitted } from "@/lib/session";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";

const STATUS_ANNOUNCEMENT = {
    connecting: "Connecting to your interviewer.",
    live: "Connected. Your interviewer is ready.",
    reconnecting: "Connection interrupted. Reconnecting.",
    failed: "Could not connect to your interviewer.",
} as const;

export function Interview() {
    usePageTitle("Interview");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");
    const { user } = useAuth();
    const desktop = useMediaQuery("(min-width: 1024px)");

    const [editor, setEditor] = useState({ open: false, language: "javascript", question: "" });
    const [problemNumber, setProblemNumber] = useState(0);
    const [submittedCurrent, setSubmittedCurrent] = useState(false);
    const [endOpen, setEndOpen] = useState(false);

    const handleEvent = useCallback((event: ServerEvent) => {
        if (event.type === "SHOW_CODE_EDITOR") {
            setEditor({ open: true, language: event.language || "javascript", question: event.question || "" });
            setProblemNumber((current) => current + 1);
            setSubmittedCurrent(false);
        } else if (event.type === "HIDE_CODE_EDITOR") {
            // Clear the question so the next problem starts fresh.
            setEditor((current) => ({ ...current, open: false, question: "" }));
            setSubmittedCurrent(false);
        }
    }, []);

    const session = useInterviewSession({ onEvent: handleEvent });
    const elapsed = useElapsed(session.startedAt);
    const split = editor.open && desktop;
    const canCloseEditor = !editor.question || submittedCurrent;
    const connecting = session.status === "connecting";

    const toggleEditor = useCallback(() => {
        if (editor.open && !canCloseEditor) {
            toast("Submit your code before closing the editor.");
            return;
        }
        setEditor((current) => ({ ...current, open: !current.open }));
    }, [editor.open, canCloseEditor]);

    // Start fetching Monaco now so the editor opens instantly when the interviewer asks for it.
    useEffect(() => {
        void loader.init();
    }, []);

    const { toggleMic } = session;
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true'], .monaco-editor, [role='dialog'], [role='listbox']")) return;

            const key = event.key.toLowerCase();
            if (key === "m") {
                event.preventDefault();
                toggleMic();
            } else if (key === "e") {
                event.preventDefault();
                toggleEditor();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [toggleMic, toggleEditor]);

    function handleSubmit(code: string, language: string) {
        const delivered = session.submitCode(code, language);
        if (!delivered) {
            toast.error("We couldn't reach your interviewer. Check your connection and try again.");
            return false;
        }
        setSubmittedCurrent(true);
        recordProblemSubmitted(problemNumber || 1);
        return true;
    }

    function handleEnd() {
        session.endInterview();
        setEndOpen(false);
        navigate(`/result?userId=${userId || ""}`);
    }

    const editorPanel = (layout: "split" | "sheet") => (
        <EditorPanel
            key={problemNumber}
            layout={layout}
            initialLanguage={editor.language}
            question={editor.question}
            problemNumber={problemNumber}
            canClose={canCloseEditor}
            onClose={toggleEditor}
            onSubmit={handleSubmit}
        />
    );

    return (
        <InterviewLayout>
            <audio ref={session.audioRef} autoPlay playsInline />
            <p role="status" className="sr-only">
                {STATUS_ANNOUNCEMENT[session.status]}
            </p>

            <TopBar role={getInterviewRole()} status={session.status} elapsedSeconds={elapsed} />

            <main className="min-h-0 flex-1 p-3 sm:p-4">
                <div
                    className="grid h-full gap-3 transition-[grid-template-columns] duration-700 ease-out-expo"
                    style={{ gridTemplateColumns: split ? "minmax(0,0.38fr) minmax(0,0.62fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                >
                    <section
                        className="grid min-h-0 min-w-0 gap-3 overflow-hidden transition-[grid-template-rows] duration-700 ease-out-expo"
                        style={{ gridTemplateRows: split ? "minmax(0,0.3fr) minmax(0,0.7fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                    >
                        <div className={cn("grid min-h-0 gap-3", split ? "grid-cols-2" : "h-full max-h-[680px] grid-cols-1 self-center sm:grid-cols-2")}>
                            <Tile kind="ai" label="Interviewer" level={session.aiLevel} connecting={connecting} compact={split} />
                            <Tile
                                kind="user"
                                label="You"
                                level={session.userLevel}
                                initials={getInitials(user?.name, "You")}
                                muted={session.isMicMuted}
                                connecting={connecting}
                                compact={split}
                            />
                        </div>
                        <div className="min-h-0 overflow-hidden" inert={!split}>
                            <ProblemPanel question={editor.question} number={problemNumber} className="h-full" />
                        </div>
                    </section>

                    <section className="min-h-0 min-w-0 overflow-hidden">
                        <AnimatePresence>
                            {split && (
                                <m.div
                                    key="split-editor"
                                    className="h-full min-w-[560px]"
                                    initial={{ opacity: 0, x: 32 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 32 }}
                                    transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                                >
                                    {editorPanel("split")}
                                </m.div>
                            )}
                        </AnimatePresence>
                    </section>
                </div>
            </main>

            <ControlBar
                isMicMuted={session.isMicMuted}
                onToggleMic={toggleMic}
                editorOpen={editor.open}
                onToggleEditor={toggleEditor}
                onEnd={() => setEndOpen(true)}
                disabled={session.status === "failed"}
            />

            <AnimatePresence>
                {editor.open && !desktop && (
                    <m.div
                        key="sheet-editor"
                        className="fixed inset-0 z-30 bg-night p-3"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                    >
                        {editorPanel("sheet")}
                    </m.div>
                )}
            </AnimatePresence>

            <EndDialog open={endOpen} onOpenChange={setEndOpen} onConfirm={handleEnd} />

            {session.status === "failed" && (
                <FailedState message={session.error} onRetry={session.retry} onBack={() => navigate(`/form?userId=${userId || ""}`)} />
            )}
        </InterviewLayout>
    );
}
