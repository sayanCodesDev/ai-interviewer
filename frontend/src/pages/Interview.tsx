import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Tile } from "@/components/audio/Tile";
import { CaptionStrip, TranscriptDialog, TypeBox, applyCaption, type CaptionItem } from "@/components/interview/Captions";
import { ControlBar } from "@/components/interview/ControlBar";
import { EditorPanel } from "@/components/interview/EditorPanel";
import { EndDialog } from "@/components/interview/EndDialog";
import { FailedState } from "@/components/interview/FailedState";
import { ProblemPane } from "@/components/interview/ProblemPane";
import { TopBar, type RoundInfo } from "@/components/interview/TopBar";
import { getInitials } from "@/components/UserMenu";
import { useAuth } from "@/context/AuthContext";
import { useElapsed } from "@/hooks/useElapsed";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import { InterviewLayout } from "@/layouts/InterviewLayout";
import { endInterviewOverHttp, fetchInterview } from "@/lib/interviews";
import { loader } from "@/lib/monaco-setup";
import { EASE_OUT_EXPO } from "@/lib/motion";
import type { InterviewMeta, Language, PublicProblem, ServerEvent, TestRun } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_ANNOUNCEMENT = {
    connecting: "Connecting to your interviewer.",
    live: "Connected. Your interviewer is ready.",
    reconnecting: "Connection interrupted. Reconnecting.",
    failed: "Could not connect to your interviewer.",
    ended: "The interview has ended.",
} as const;

interface EditorState {
    open: boolean;
    visible: boolean;
    mode: "code" | "notes";
    problem?: PublicProblem;
    title: string;
    prompt: string;
    number: number;
    total: number;
    language: string;
}

const CLOSED_EDITOR: EditorState = { open: false, visible: true, mode: "code", title: "", prompt: "", number: 0, total: 0, language: "javascript" };

export function Interview() {
    usePageTitle("Interview");
    const navigate = useNavigate();
    const { id = "" } = useParams();
    const { user } = useAuth();
    const desktop = useMediaQuery("(min-width: 1024px)");

    const [meta, setMeta] = useState<InterviewMeta | null>(null);
    const [round, setRound] = useState<RoundInfo | null>(null);
    const [editor, setEditor] = useState<EditorState>(CLOSED_EDITOR);
    const [results, setResults] = useState<Record<string, TestRun>>({});
    const [submitting, setSubmitting] = useState(false);
    const [captions, setCaptions] = useState<CaptionItem[]>([]);
    const [agentState, setAgentState] = useState<"thinking" | "listening" | "speaking" | "ending">("listening");
    const [captionsOn, setCaptionsOn] = useState(true);
    const [typeOpen, setTypeOpen] = useState(false);
    const [transcriptOpen, setTranscriptOpen] = useState(false);
    const [endOpen, setEndOpen] = useState(false);
    const [ending, setEnding] = useState(false);
    const leaving = useRef(false);

    useEffect(() => {
        fetchInterview(id).then(setMeta).catch(() => undefined);
    }, [id]);

    const goToReport = useCallback(() => {
        if (leaving.current) return;
        leaving.current = true;
        navigate(`/report/${id}`, { replace: true });
    }, [id, navigate]);

    const handleEvent = useCallback((event: ServerEvent) => {
        switch (event.type) {
            case "ROUND":
                setRound({ index: event.index, total: event.total, title: event.title });
                break;
            case "SHOW_CODE_EDITOR":
                setEditor({ open: true, visible: true, mode: event.mode, problem: event.problem, title: event.title, prompt: event.question, number: event.problemNumber, total: event.problemTotal, language: event.language });
                setSubmitting(false);
                break;
            case "HIDE_CODE_EDITOR":
                setEditor((current) => ({ ...current, open: false }));
                break;
            case "SUBMISSION_RESULT":
                setResults((current) => ({ ...current, [event.problemKey]: event.run }));
                setSubmitting(false);
                break;
            case "CAPTION":
                setCaptions((list) => applyCaption(list, { id: event.id, role: event.role, text: event.text, final: event.final }));
                break;
            case "STATE":
                setAgentState(event.state);
                break;
            case "NOTICE":
                if (event.level === "warning") toast.warning(event.message);
                else toast(event.message);
                setSubmitting(false);
                break;
            case "ENDING":
                setEnding(true);
                setTimeout(goToReport, 900);
                break;
        }
    }, [goToReport]);

    const session = useInterviewSession({ interviewId: id, onEvent: handleEvent });
    const elapsed = useElapsed(session.startedAt);
    const connecting = session.status === "connecting";
    const split = editor.open && editor.visible && desktop;
    const problemKey = editor.problem?.key ?? "";

    // Start fetching Monaco now so the editor opens instantly when the interviewer asks for it.
    useEffect(() => {
        void loader.init();
    }, []);

    const toggleEditor = useCallback(() => {
        setEditor((current) => (current.open ? { ...current, visible: !current.visible } : current));
    }, []);

    const { toggleMic } = session;
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true'], .monaco-editor, [role='dialog'], [role='listbox'], [role='tab']")) return;

            const key = event.key.toLowerCase();
            if (key === "m") { event.preventDefault(); toggleMic(); }
            else if (key === "e") { event.preventDefault(); toggleEditor(); }
            else if (key === "c") { event.preventDefault(); setCaptionsOn((on) => !on); }
            else if (key === "t") { event.preventDefault(); setTypeOpen((open) => !open); }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [toggleMic, toggleEditor]);

    // The room ended on the server side (already finished, or lost): go somewhere useful.
    useEffect(() => {
        if (session.status === "ended" && session.error?.code === "interrupted") setTimeout(goToReport, 1500);
    }, [session.status, session.error, goToReport]);

    function handleSubmitCode(code: string, language: Language) {
        if (!editor.problem) return false;
        const delivered = session.send({ type: "SUBMIT_CODE", problemKey: editor.problem.key, language, code });
        if (delivered) setSubmitting(true);
        return delivered;
    }

    function handleCodeSnapshot(code: string, language: Language) {
        if (editor.problem) session.send({ type: "CODE_SNAPSHOT", problemKey: editor.problem.key, language, code: code.slice(0, 12_000) });
    }

    function handleSubmitNotes(text: string) {
        return session.send({ type: "SUBMIT_NOTES", text });
    }

    async function handleEnd() {
        setEndOpen(false);
        setEnding(true);
        const sent = session.send({ type: "END_INTERVIEW" });
        // The server confirms with an ENDING event; if the call is gone or slow, end it over HTTP instead.
        setTimeout(async () => {
            if (leaving.current) return;
            if (!sent) await endInterviewOverHttp(id).catch(() => undefined);
            goToReport();
        }, sent ? 3500 : 300);
    }

    const editorPanel = (layout: "split" | "sheet") => (
        <EditorPanel
            key={`${problemKey}:${editor.mode}`}
            layout={layout}
            interviewId={id}
            mode={editor.mode}
            problem={editor.problem}
            title={editor.title}
            prompt={editor.prompt}
            problemNumber={editor.number}
            problemTotal={editor.total}
            submitResult={results[problemKey] ?? null}
            submitting={submitting}
            onSubmitCode={handleSubmitCode}
            onSubmitNotes={handleSubmitNotes}
            onClose={toggleEditor}
            preferredLanguage={editor.language}
            onCodeSnapshot={handleCodeSnapshot}
        />
    );

    const failed = session.status === "failed" || session.status === "ended";
    const isThinking = agentState === "thinking";

    return (
        <InterviewLayout>
            <audio ref={session.audioRef} autoPlay playsInline />
            <p role="status" className="sr-only">
                {STATUS_ANNOUNCEMENT[session.status]}
            </p>

            <TopBar role={meta?.role} status={session.status} elapsedSeconds={elapsed} plannedMinutes={meta?.durationMinutes} round={round} onOpenTranscript={() => setTranscriptOpen(true)} connection={session.quality.level} />

            <main className="min-h-0 flex-1 p-3 sm:p-4">
                <div
                    className="grid h-full gap-3 transition-[grid-template-columns] duration-700 ease-out-expo"
                    style={{ gridTemplateColumns: split ? "minmax(0,0.36fr) minmax(0,0.64fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                >
                    <section
                        className="grid min-h-0 min-w-0 gap-3 overflow-hidden transition-[grid-template-rows] duration-700 ease-out-expo"
                        style={{ gridTemplateRows: split ? "minmax(0,0.26fr) minmax(0,0.74fr)" : "minmax(0,1fr) minmax(0,0fr)" }}
                    >
                        <div className={cn("grid min-h-0 gap-3", split ? "grid-cols-2" : "h-full max-h-[680px] grid-cols-1 self-center sm:grid-cols-2")}>
                            <Tile kind="ai" label="Interviewer" level={session.aiLevel} connecting={connecting} thinking={isThinking} compact={split} />
                            <Tile kind="user" label="You" level={session.userLevel} initials={getInitials(user?.name, "You")} muted={session.isMicMuted} connecting={connecting} compact={split} />
                        </div>
                        <div className="min-h-0 overflow-hidden" inert={!split}>
                            <ProblemPane problem={editor.problem} fallbackText={editor.prompt} title={editor.title} number={editor.number} total={editor.total} className="h-full" />
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

            {captionsOn && !ending && <CaptionStrip captions={captions} />}
            {typeOpen && !ending && <TypeBox disabled={session.status !== "live"} onSend={(text) => session.send({ type: "USER_TEXT", text })} />}

            <ControlBar
                isMicMuted={session.isMicMuted}
                onToggleMic={session.toggleMic}
                editorAvailable={editor.open}
                editorVisible={editor.visible}
                onToggleEditor={toggleEditor}
                captionsOn={captionsOn}
                onToggleCaptions={() => setCaptionsOn((on) => !on)}
                typeOpen={typeOpen}
                onToggleType={() => setTypeOpen((open) => !open)}
                onEnd={() => setEndOpen(true)}
                disabled={failed || ending}
            />

            <AnimatePresence>
                {editor.open && editor.visible && !desktop && (
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

            <EndDialog open={endOpen} onOpenChange={setEndOpen} onConfirm={() => void handleEnd()} />
            <TranscriptDialog open={transcriptOpen} onOpenChange={setTranscriptOpen} captions={captions} />

            {ending && (
                <div role="status" className="absolute inset-0 z-40 flex items-center justify-center bg-night/90 p-6 text-center">
                    <div>
                        <p className="label-mono text-night-muted">Wrapping up</p>
                        <h2 className="text-h2 mt-4">Preparing your report…</h2>
                    </div>
                </div>
            )}

            {failed && !ending && (
                <FailedState
                    message={session.error?.message ?? null}
                    ended={session.status === "ended"}
                    onRetry={session.retry}
                    onBack={() => navigate(session.error?.code === "interrupted" || session.error?.code === "already_ended" ? `/report/${id}` : "/dashboard")}
                    backLabel={session.error?.code === "interrupted" || session.error?.code === "already_ended" ? "See your report" : "Back to dashboard"}
                />
            )}
        </InterviewLayout>
    );
}
