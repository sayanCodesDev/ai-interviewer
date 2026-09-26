import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { ServerEvent } from "@/lib/types";

export type SessionStatus = "connecting" | "live" | "reconnecting" | "failed" | "ended";

export type ClientMessage =
    | { type: "SUBMIT_CODE"; problemKey: string; language: string; code: string }
    | { type: "SUBMIT_NOTES"; text: string }
    | { type: "USER_TEXT"; text: string }
    | { type: "END_INTERVIEW" };

/** The server refused the call for a reason worth acting on, not just showing. */
export class SessionError extends Error {
    constructor(message: string, public readonly code?: string) {
        super(message);
    }
}

const MAX_RECONNECTS = 4;

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            pc.removeEventListener("icegatheringstatechange", check);
            clearTimeout(timer);
            resolve();
        };
        const check = () => {
            if (pc.iceGatheringState === "complete") done();
        };
        const timer = setTimeout(done, timeoutMs);
        pc.addEventListener("icegatheringstatechange", check);
    });
}

function describeError(error: unknown): { message: string; code?: string } {
    if (error instanceof SessionError) return { message: error.message, code: error.code };
    const name = (error as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
        return { message: "Microphone access was blocked. Allow the microphone in your browser's address bar, then try again.", code: "mic_blocked" };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
        return { message: "We couldn't find a microphone. Connect one and try again.", code: "mic_missing" };
    }
    return { message: (error as Error)?.message || "Could not start the interview. Please try again." };
}

/** Watches an audio stream and reports its loudness as 0-100, with a noise gate so background hiss reads as silence. */
export function monitorStreamVolume(stream: MediaStream, onVolumeLevel: (volume: number) => void) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);

    const NOISE_THRESHOLD = 15;
    const MAX_EXPECTED_VOLUME = 80;
    let frameId = 0;

    const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i]!;
        const average = sum / bufferLength;

        let normalizedVolume = 0;
        if (average > NOISE_THRESHOLD) {
            normalizedVolume = Math.min(100, Math.round(((average - NOISE_THRESHOLD) / (MAX_EXPECTED_VOLUME - NOISE_THRESHOLD)) * 100));
        }
        onVolumeLevel(normalizedVolume);
        frameId = requestAnimationFrame(checkVolume);
    };
    checkVolume();

    return () => {
        cancelAnimationFrame(frameId);
        source.disconnect();
        analyser.disconnect();
        void audioContext.close();
    };
}

interface Options {
    interviewId: string;
    onEvent: (event: ServerEvent) => void;
}

/**
 * Owns the WebRTC call to the interviewer: microphone, inbound audio, the "ui-events" data channel,
 * teardown and automatic reconnection. Audio levels go to Motion values so the UI can animate them
 * without re-rendering. If the connection drops mid-interview the same interview is resumed (the
 * server holds it open for a while), reusing the microphone so no new permission prompt appears.
 */
export function useInterviewSession({ interviewId, onEvent }: Options) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const micTrackRef = useRef<MediaStreamTrack | null>(null);
    const onEventRef = useRef(onEvent);

    const aiLevel = useMotionValue(0);
    const userLevel = useMotionValue(0);

    const [status, setStatus] = useState<SessionStatus>("connecting");
    const [error, setError] = useState<{ message: string; code?: string } | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        let cancelled = false;
        const cleanups: Array<() => void> = [];
        let peer: RTCPeerConnection | null = null;
        let peerCleanups: Array<() => void> = [];
        let reconnects = 0;
        let live = false;
        let disconnectTimer: ReturnType<typeof setTimeout> | undefined;

        setStatus("connecting");
        setError(null);
        setIsMicMuted(false);
        aiLevel.set(0);
        userLevel.set(0);

        const markLive = () => {
            if (cancelled) return;
            live = true;
            clearTimeout(disconnectTimer);
            setStatus("live");
            setStartedAt((current) => current ?? Date.now());
        };

        const fail = (err: unknown) => {
            if (cancelled) return;
            const described = describeError(err);
            setError(described);
            setStatus(described.code === "already_ended" || described.code === "interrupted" ? "ended" : "failed");
        };

        const closePeer = () => {
            for (const stop of peerCleanups.reverse()) {
                try {
                    stop();
                } catch {
                    /* already gone */
                }
            }
            peerCleanups = [];
            try {
                peer?.close();
            } catch {
                /* already closed */
            }
            peer = null;
            dataChannelRef.current = null;
        };

        /** Builds a peer connection, does the handshake, and wires events. Throws SessionError on a refusal. */
        async function connectPeer(stream: MediaStream) {
            // The server is directly reachable (or advertises its public address), so no STUN/TURN is needed.
            const pc = new RTCPeerConnection({ iceServers: [] });
            peer = pc;

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
                if (cancelled || pc !== peer) return;
                if (pc.connectionState === "connected") markLive();
                else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                    // "disconnected" often heals by itself; give it a few seconds before rebuilding the call.
                    clearTimeout(disconnectTimer);
                    setStatus(live ? "reconnecting" : "connecting");
                    disconnectTimer = setTimeout(() => void reconnect(stream), pc.connectionState === "failed" ? 0 : 4000);
                }
            };

            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                markLive();
                if (!audioRef.current) return;
                const inbound = new MediaStream([event.track]);
                audioRef.current.srcObject = inbound;
                peerCleanups.push(monitorStreamVolume(inbound, (volume) => aiLevel.set(volume / 100)));
                audioRef.current.play().catch((err) => console.error("Autoplay blocked:", err));
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            // The offer goes out in one piece (no trickle ICE), so wait briefly for candidates to be gathered.
            await waitForIceGathering(pc, 1500);
            if (cancelled) return;

            const response = await apiFetch("/api/webrtc/offer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sdp: pc.localDescription!.sdp, type: pc.localDescription!.type, interviewId }),
            });
            if (cancelled) return;

            if (!response.ok) {
                const detail = await response.json().catch(() => ({}));
                throw new SessionError(detail.msg || `The server rejected the call (${response.status}).`, detail.code);
            }
            await pc.setRemoteDescription(new RTCSessionDescription(await response.json()));
        }

        async function reconnect(stream: MediaStream) {
            if (cancelled || !live) return;
            if (reconnects >= MAX_RECONNECTS) {
                fail(new SessionError("The connection to your interviewer was lost and couldn't be restored.", "lost"));
                return;
            }
            reconnects++;
            closePeer();
            setStatus("reconnecting");
            await new Promise((resolve) => setTimeout(resolve, 600 * reconnects));
            try {
                await connectPeer(stream);
            } catch (err) {
                if ((err as SessionError).code === "at_capacity" || (err as SessionError).code === "draining") {
                    disconnectTimer = setTimeout(() => void reconnect(stream), 3000);
                } else fail(err);
            }
        }

        (async () => {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            cleanups.push(() => stream.getTracks().forEach((track) => track.stop()));
            if (cancelled) return;

            // A muted mic reads as silence; don't let stray noise animate the tile while muted.
            cleanups.push(
                monitorStreamVolume(stream, (volume) => {
                    const muted = micTrackRef.current !== null && !micTrackRef.current.enabled;
                    userLevel.set(muted ? 0 : volume / 100);
                }),
            );
            micTrackRef.current = stream.getAudioTracks()[0] ?? null;

            await connectPeer(stream);
        })().catch(fail);

        return () => {
            cancelled = true;
            clearTimeout(disconnectTimer);
            closePeer();
            for (const stop of cleanups.reverse()) {
                try {
                    stop();
                } catch (e) {
                    console.error("Interview teardown error:", e);
                }
            }
            micTrackRef.current = null;
        };
    }, [attempt, interviewId, aiLevel, userLevel]);

    const toggleMic = useCallback(() => {
        const track = micTrackRef.current;
        if (!track) return;
        track.enabled = !track.enabled;
        setIsMicMuted(!track.enabled);
    }, []);

    const send = useCallback((message: ClientMessage) => {
        const channel = dataChannelRef.current;
        if (channel && channel.readyState === "open") {
            channel.send(JSON.stringify(message));
            return true;
        }
        return false;
    }, []);

    const retry = useCallback(() => setAttempt((current) => current + 1), []);

    return { audioRef, aiLevel, userLevel, status, error, isMicMuted, startedAt, toggleMic, send, retry };
}
