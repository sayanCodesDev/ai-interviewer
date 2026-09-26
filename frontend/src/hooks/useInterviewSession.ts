import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { markInterviewEnded, markInterviewStarted } from "@/lib/session";

export type SessionStatus = "connecting" | "live" | "reconnecting" | "failed";

export type ServerEvent =
    | { type: "SHOW_CODE_EDITOR"; language?: string; question?: string }
    | { type: "HIDE_CODE_EDITOR" };

function describeError(error: unknown): string {
    const name = (error as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
        return "Microphone access was blocked. Allow the microphone in your browser's address bar, then try again.";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
        return "We couldn't find a microphone. Connect one and try again.";
    }
    return (error as Error)?.message || "Could not start the interview. Please try again.";
}

/** Watches an audio stream and reports its loudness as 0-100, with a noise gate so background hiss reads as silence. */
function monitorStreamVolume(stream: MediaStream, onVolumeLevel: (volume: number) => void) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);

    const NOISE_THRESHOLD = 15; // Any sound level below this is ignored (filters out noise)
    const MAX_EXPECTED_VOLUME = 80; // Peak voice volume to map against
    let frameId: number;

    const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]!;
        }
        const average = sum / bufferLength;

        let normalizedVolume = 0;
        if (average > NOISE_THRESHOLD) {
            const speechAmount = average - NOISE_THRESHOLD;
            const maxSpeechRange = MAX_EXPECTED_VOLUME - NOISE_THRESHOLD;
            normalizedVolume = Math.min(100, Math.round((speechAmount / maxSpeechRange) * 100));
        }

        onVolumeLevel(normalizedVolume);
        frameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();

    return () => {
        cancelAnimationFrame(frameId);
        source.disconnect();
        analyser.disconnect();
        audioContext.close();
    };
}

/**
 * Owns the WebRTC call to the interviewer: microphone, inbound audio, the "ui-events" data channel and
 * teardown. Audio levels are written to Motion values so the UI can animate them without re-rendering.
 */
export function useInterviewSession({ onEvent }: { onEvent: (event: ServerEvent) => void }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const micTrackRef = useRef<MediaStreamTrack | null>(null);
    const onEventRef = useRef(onEvent);

    const aiLevel = useMotionValue(0);
    const userLevel = useMotionValue(0);

    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [error, setError] = useState<string | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        // Guards against React's double-invoked effects in development and against
        // the candidate navigating away mid-handshake.
        let cancelled = false;
        // Every AudioContext / analyser / media track opened below, so none of them
        // outlive the page.
        const teardown: Array<() => void> = [];

        const markLive = () => {
            if (cancelled) return;
            setStatus("live");
            setStartedAt(markInterviewStarted());
        };

        setStatus("connecting");
        setError(null);
        setIsMicMuted(false);
        aiLevel.set(0);
        userLevel.set(0);

        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [], // Discovers public IPs
            });
            teardown.push(() => pc.close());

            // Create DataChannel on frontend to listen for events from server
            const dc = pc.createDataChannel("ui-events");
            dataChannelRef.current = dc;
            dc.onopen = markLive;
            dc.onmessage = (event) => {
                try {
                    onEventRef.current(JSON.parse(event.data) as ServerEvent);
                } catch (e) {
                    console.error("DataChannel JSON error:", e);
                }
            };

            pc.onconnectionstatechange = () => {
                if (cancelled) return;
                if (pc.connectionState === "connected") markLive();
                else if (pc.connectionState === "disconnected") setStatus("reconnecting");
                else if (pc.connectionState === "failed") {
                    setError("The connection to your interviewer was lost.");
                    setStatus("failed");
                }
            };

            // Capture mic and add tracks
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1, // Force Mono
                },
            });
            teardown.push(() => stream.getTracks().forEach((track) => track.stop()));
            if (cancelled) return;

            // Start monitoring user speech
            // A muted mic reads as silence; don't let stray noise animate the tile while muted.
            teardown.push(
                monitorStreamVolume(stream, (volume) => {
                    const muted = micTrackRef.current !== null && !micTrackRef.current.enabled;
                    userLevel.set(muted ? 0 : volume / 100);
                }),
            );

            stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
                if (track.kind === "audio") {
                    micTrackRef.current = track;
                }
            });

            // Listen for the inbound AI audio track
            pc.ontrack = (event) => {
                markLive();

                if (audioRef.current) {
                    // Wrap the bare track in a MediaStream so the browser can play it
                    const inboundStream = new MediaStream([event.track]);
                    audioRef.current.srcObject = inboundStream;

                    // Start monitoring AI speech
                    teardown.push(monitorStreamVolume(inboundStream, (volume) => aiLevel.set(volume / 100)));

                    // Force play to bypass browser autoplay restrictions
                    audioRef.current.play().catch((err) => console.error("Autoplay blocked:", err));
                }
            };

            // Create the initial WebRTC Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (cancelled) return;

            // Send the FULL complete SDP (including embedded ICE candidates) to the server.
            const response = await apiFetch("/api/webrtc/offer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sdp: pc.localDescription!.sdp,
                    type: pc.localDescription!.type,
                }),
            });
            if (cancelled) return;

            if (!response.ok) {
                const detail = await response.json().catch(() => ({}));
                throw new Error(detail.msg || `Server rejected the call (${response.status}).`);
            }

            // Receive the server's complete SDP Answer and apply it
            const answer = await response.json();
            if (cancelled) return;
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }

        start().catch((err) => {
            if (cancelled) return;
            console.error("Failed to start the interview call:", err);
            setError(describeError(err));
            setStatus("failed");
        });

        return () => {
            cancelled = true;
            // Run in reverse so the peer connection closes last.
            for (const stop of teardown.reverse()) {
                try {
                    stop();
                } catch (e) {
                    console.error("Interview teardown error:", e);
                }
            }
            dataChannelRef.current = null;
            micTrackRef.current = null;
        };
    }, [attempt, aiLevel, userLevel]);

    const toggleMic = useCallback(() => {
        const track = micTrackRef.current;
        if (!track) return;
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
    }, []);

    const send = useCallback((message: object) => {
        const channel = dataChannelRef.current;
        if (channel && channel.readyState === "open") {
            channel.send(JSON.stringify(message));
            return true;
        }
        return false;
    }, []);

    /** Tell the backend to stop AI processing. Leaving the page then closes the mic and the peer connection. */
    const endInterview = useCallback(() => {
        send({ type: "END_INTERVIEW" });
        markInterviewEnded();
    }, [send]);

    const submitCode = useCallback((code: string, language: string) => send({ type: "SUBMIT_CODE", language, code }), [send]);

    const retry = useCallback(() => setAttempt((current) => current + 1), []);

    return { audioRef, aiLevel, userLevel, status, error, isMicMuted, startedAt, toggleMic, submitCode, endInterview, retry };
}
