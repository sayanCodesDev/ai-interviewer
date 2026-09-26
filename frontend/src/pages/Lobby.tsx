import { ArrowRight, Headphones, Mic, TriangleAlert, Volume2 } from "lucide-react";
import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Waveform } from "@/components/audio/Waveform";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { monitorStreamVolume } from "@/hooks/useInterviewSession";
import { AppLayout } from "@/layouts/AppLayout";
import { apiFetch } from "@/lib/api";
import { fetchInterview } from "@/lib/interviews";
import type { InterviewMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

type MicState = "idle" | "requesting" | "ok" | "blocked" | "missing";

const LEVEL_LABEL: Record<string, string> = { intern: "intern", junior: "junior", mid: "mid-level", senior: "senior", staff: "staff-level" };

/**
 * Bluetooth headsets drop to a phone-call audio mode (narrow, muffled, prone to breaking up) the moment their
 * microphone is switched on. It is the most common reason a clear voice sounds bad, and it is not something the
 * site can fix, so say so before the interview starts.
 */
const BLUETOOTH_LIKE = /bluetooth|airpods|buds|hands-?free|hfp|headset|\bwh-\d|\bwf-\d|beats|jabra|bose|momentum|freebuds/i;

/** A short tone through the speakers, so a candidate knows they'll hear the interviewer. */
async function playTestTone() {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 523;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.75);
    await new Promise((resolve) => setTimeout(resolve, 900));
    void context.close();
}

export function Lobby() {
    usePageTitle("Get ready");
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const level = useMotionValue(0);

    const [meta, setMeta] = useState<InterviewMeta | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mic, setMic] = useState<MicState>("idle");
    const [heard, setHeard] = useState(false);
    const [toneing, setToneing] = useState(false);
    const [micLabel, setMicLabel] = useState("");
    const stream = useRef<MediaStream | null>(null);
    const stopMeter = useRef<(() => void) | null>(null);
    const heardRef = useRef(false);

    // Poll until the interview plan is ready (the job description is analysed in the background).
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            try {
                const next = await fetchInterview(id);
                if (cancelled) return;
                setMeta(next);
                if (next.status === "COMPLETED" || next.status === "ABANDONED") {
                    navigate(`/report/${id}`, { replace: true });
                    return;
                }
                if (next.planStatus === "PENDING") timer = setTimeout(tick, 1200);
            } catch {
                if (!cancelled) setLoadError("We couldn't find that interview.");
            }
        };
        void tick();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [id, navigate]);

    const releaseMic = useCallback(() => {
        stopMeter.current?.();
        stopMeter.current = null;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
    }, []);
    useEffect(() => releaseMic, [releaseMic]);

    async function checkMic() {
        setMic("requesting");
        try {
            const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            stream.current = media;
            setMicLabel(media.getAudioTracks()[0]?.label ?? "");
            stopMeter.current = monitorStreamVolume(media, (volume) => {
                level.set(volume / 100);
                if (volume > 12 && !heardRef.current) {
                    heardRef.current = true;
                    setHeard(true);
                }
            });
            setMic("ok");
        } catch (error) {
            const name = (error as { name?: string })?.name;
            setMic(name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "blocked");
        }
    }

    /** Plays a few seconds of the interviewer's actual voice; if that isn't available here, a plain tone. */
    async function testSpeakers() {
        setToneing(true);
        try {
            const response = await apiFetch(`/api/interviews/${id}/voice-sample`).catch(() => null);
            if (response?.ok) {
                const url = URL.createObjectURL(await response.blob());
                try {
                    const sample = new Audio(url);
                    await sample.play();
                    await new Promise<void>((resolve) => {
                        sample.onended = () => resolve();
                        sample.onerror = () => resolve();
                    });
                } finally {
                    URL.revokeObjectURL(url);
                }
            } else {
                await playTestTone();
            }
        } catch {
            await playTestTone().catch(() => undefined);
        } finally {
            setToneing(false);
        }
    }

    function start() {
        // The room asks for the microphone itself; let go of ours first so it isn't held twice.
        releaseMic();
        navigate(`/interview/${id}`);
    }

    const ready = meta?.planStatus === "READY";
    const failed = meta?.planStatus === "FAILED";
    const canStart = ready && mic === "ok";

    return (
        <AppLayout>
            <div className="app-container py-12 lg:py-16">
                <p className="label-mono text-muted-foreground">Before you start</p>
                <h1 className="text-h2 mt-4">Check your sound.</h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                    The interviewer speaks out loud and listens through your microphone. A minute here saves a rough start.
                </p>

                {loadError ? (
                    <p role="alert" className="mt-10 text-sm text-destructive">{loadError}</p>
                ) : (
                    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <section className="rounded-xl border bg-card p-7">
                            <h2 className="flex items-center gap-2 text-[15px] font-medium">
                                <Mic className="size-4 text-muted-foreground" /> Microphone
                            </h2>

                            <div className="mt-5 h-20 text-foreground" aria-hidden>
                                <Waveform level={level} />
                            </div>

                            {mic === "idle" && (
                                <Button variant="outline" size="lg" className="mt-5" onClick={() => void checkMic()}>
                                    <Mic /> Turn on microphone
                                </Button>
                            )}
                            {mic === "requesting" && (
                                <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                                    <Spinner /> Waiting for your browser's permission…
                                </p>
                            )}
                            {mic === "ok" && (
                                <p role="status" className={cn("mt-5 text-sm", heard ? "text-foreground" : "text-muted-foreground")}>
                                    {heard ? "We can hear you. You're set." : "Say something. The bars should move."}
                                </p>
                            )}
                            {mic === "ok" && BLUETOOTH_LIKE.test(micLabel) && (
                                <div role="note" className="mt-4 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklab,var(--night-amber)_50%,transparent)] bg-[color-mix(in_oklab,var(--night-amber)_10%,transparent)] px-3.5 py-3 text-[13px] leading-relaxed">
                                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--night-amber)]" aria-hidden />
                                    <p>
                                        You're using a Bluetooth headset ({micLabel}). While its microphone is on, most switch to a phone-call audio mode that sounds
                                        muffled and can break up. For the clearest voice, use wired headphones, or your computer's own speakers and microphone.
                                    </p>
                                </div>
                            )}
                            {(mic === "blocked" || mic === "missing") && (
                                <div role="alert" className="mt-5 grid gap-3">
                                    <p className="text-sm text-destructive">
                                        {mic === "blocked"
                                            ? "Microphone access is blocked. Allow it from the icon in your browser's address bar, then try again."
                                            : "We couldn't find a microphone. Connect one and try again."}
                                    </p>
                                    <Button variant="outline" size="sm" className="w-fit" onClick={() => void checkMic()}>
                                        Try again
                                    </Button>
                                </div>
                            )}

                            <div className="mt-7 border-t pt-6">
                                <h2 className="flex items-center gap-2 text-[15px] font-medium">
                                    <Volume2 className="size-4 text-muted-foreground" /> Speakers
                                </h2>
                                <Button variant="outline" size="sm" className="mt-4" onClick={() => void testSpeakers()} disabled={toneing}>
                                    {toneing ? <Spinner /> : <Volume2 />} Hear your interviewer
                                </Button>
                                <p className="mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
                                    <Headphones className="mt-0.5 size-4 shrink-0" /> Headphones stop the interviewer's voice feeding back into your microphone.
                                </p>
                            </div>
                        </section>

                        <section className="rounded-xl border bg-card p-7">
                            <div className="flex items-baseline justify-between gap-3">
                                <h2 className="text-[15px] font-medium">Your interview</h2>
                                {meta && <p className="font-mono text-xs text-muted-foreground">{meta.durationMinutes} min</p>}
                            </div>

                            {!meta || meta.planStatus === "PENDING" ? (
                                <div className="mt-6" aria-live="polite">
                                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Spinner /> Preparing your interviewer. This can take a few seconds when you've added a job description.
                                    </p>
                                    <div className="mt-6 grid gap-4">
                                        {[0, 1, 2, 3].map((i) => (
                                            <Skeleton key={i} className="h-5 w-full" />
                                        ))}
                                    </div>
                                </div>
                            ) : failed ? (
                                <div role="alert" className="mt-6">
                                    <p className="text-sm text-destructive">{meta.planError ?? "We couldn't prepare this interview."}</p>
                                    <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/setup")}>
                                        Back to setup
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <p className="mt-2 text-[13px] text-muted-foreground">
                                        {meta.role}, {LEVEL_LABEL[meta.level] ?? meta.level}.{" "}
                                        {meta.analysisSource === "llm" ? "Questions are tailored to your job description and background." : "Questions are chosen for the role and your level."}
                                    </p>
                                    <ol className="mt-6 grid gap-4">
                                        {meta.plan!.rounds.map((round, index) => (
                                            <li key={round.key} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-3">
                                                <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                                <div>
                                                    <p className="text-[15px] font-medium">{round.title}</p>
                                                    {round.problems ? <p className="mt-0.5 text-[13px] text-muted-foreground">{round.problems} coding problem{round.problems === 1 ? "" : "s"}</p> : null}
                                                </div>
                                                <span className="font-mono text-xs text-muted-foreground">{round.minutes} min</span>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                        </section>
                    </div>
                )}

                <div className="mt-10 flex flex-wrap items-center gap-4">
                    <Button variant="signal" size="lg" disabled={!canStart} onClick={start} className="group">
                        Start interview
                        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Button>
                    {!canStart && !failed && !loadError && (
                        <p className="text-sm text-muted-foreground">
                            {mic !== "ok" ? "Turn on your microphone to continue." : "Almost ready…"}
                        </p>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
