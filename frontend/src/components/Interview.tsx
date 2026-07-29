import { useEffect, useRef, useState } from "react";
import aiLogo from "../assets/cartoon-style-robot-vectorart_78370-4103.avif";
import userLogo from "../assets/avatar-person-cartoon-style-whimsical-cartoon-design-feature-mans-avatar_198565-9429.avif"
import { useNavigate, useSearchParams } from "react-router-dom";
import { BACKEND_URL } from "../lib/config";
import { Navbar } from "./Navbar";
import { AnimatedBackground } from "./AnimatedBackground";
import { CodeEditorModal } from "./CodeEditorModal";

export function Interview() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get("userId");

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const micTrackRef = useRef<MediaStreamTrack | null>(null);
    const [endCallValue, setEndCallBool] = useState(false);
    const [userVolume, setUserVolume] = useState(0);
    const [aiVolume, setAiVolume] = useState(0);
    const [isMicMuted, setIsMicMuted] = useState(false);

    // Code Editor Popout State
    const [showCodeEditor, setShowCodeEditor] = useState<boolean>(false);
    const [editorLanguage, setEditorLanguage] = useState<string>("javascript");
    const [questionPrompt, setQuestionPrompt] = useState<string>("");

    const dataChannelRef = useRef<RTCDataChannel | null>(null);

    useEffect(() => {

        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [] // Discovers public IPs
            });

            // Create DataChannel on frontend to listen for events from server
            const dc = pc.createDataChannel("ui-events");
            dataChannelRef.current = dc;
            dc.onopen = () => console.log("📡 WebRTC DataChannel connected!");
            dc.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("📩 Received DataChannel message:", data);
                    if (data.type === "SHOW_CODE_EDITOR") {
                        setEditorLanguage(data.language || "javascript");
                        setQuestionPrompt(data.question || "");
                        setShowCodeEditor(true);
                    } else if (data.type === "HIDE_CODE_EDITOR") {
                        console.log("AI requested closing code editor.");
                        setShowCodeEditor(false);
                        setQuestionPrompt(""); // clear so next question starts fresh
                    }
                } catch (e) {
                    console.error("DataChannel JSON error:", e);
                }
            };

            pc.onconnectionstatechange = () => console.log("PC state:", pc.connectionState);
            pc.oniceconnectionstatechange = () => console.log("ICE state:", pc.iceConnectionState);

            // Capture mic and add tracks
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,       // Force Mono
                }
            });

            // Start monitoring user speech
            const stopUserMonitoring = monitorStreamVolume(stream, (isSpeaking) => {
                setUserVolume(isSpeaking);
            });

            stream?.getTracks().forEach(track => {
                pc.addTrack(track, stream!);
                if (track.kind === "audio") {
                    micTrackRef.current = track;
                }
            });

            // 3. LISTEN FOR THE INBOUND AI AUDIO TRACK
            // On your React Frontend:
            pc.ontrack = (event) => {
                console.log("📥 Received audio track from server!");

                if (audioRef.current) {
                    // FIX: Wrap the bare track in a MediaStream so the browser can play it
                    const inboundStream = new MediaStream([event.track]);
                    audioRef.current.srcObject = inboundStream;

                    //  Start monitoring AI speech
                    const stopAiMonitoring = monitorStreamVolume(inboundStream, (isSpeaking) => {
                        setAiVolume(isSpeaking);
                    });

                    // Force play to bypass browser autoplay restrictions
                    audioRef.current.play().catch(err => console.error("Autoplay blocked:", err));
                }
            };

            // Create the initial WebRTC Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send the FULL complete SDP (including embedded ICE candidates) to your server
            const response = await fetch(`${BACKEND_URL}/api/webrtc/offer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sdp: pc.localDescription!.sdp,
                    type: pc.localDescription!.type,
                })
            });

            // Receive the server's complete SDP Answer and apply it
            const answer = await response.json();
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            pcRef.current = pc;
        }
        start();

    }, [])

    function monitorStreamVolume(
        stream: MediaStream,
        onVolumeLevel: (volume: number) => void
    ) {
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

            // --- Noise Gate & Volume Mapping ---
            let normalizedVolume = 0;
            if (average > NOISE_THRESHOLD) {
                // Calculate height/strength of speech above the noise gate
                const speechAmount = average - NOISE_THRESHOLD;
                const maxSpeechRange = MAX_EXPECTED_VOLUME - NOISE_THRESHOLD;

                // Map speech level to a 0 - 100 percentage range, capped at 100
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

    function handleEndCall() {
        console.log("End call clicked");

        // Notify backend to stop AI processing
        if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
            dataChannelRef.current.send(JSON.stringify({ type: "END_INTERVIEW" }));
        }

        // Stop mic tracks
        if (micTrackRef.current) {
            micTrackRef.current.stop();
        }

        // Close peer connection
        if (pcRef.current) {
            pcRef.current.close();
        }

        setEndCallBool(true);
        navigate(`/result?userId=${userId || ""}`);
    }

    function handleMicToggle() {
        if (micTrackRef.current) {
            micTrackRef.current.enabled = !micTrackRef.current.enabled;
            setIsMicMuted(!micTrackRef.current.enabled);
        }
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-[#f0f4f8] dark:bg-[#0d0e12] transition-colors duration-200 overflow-hidden">
            <Navbar />

            <div className="flex-1 flex w-full relative overflow-hidden">
                <AnimatedBackground />

                {/* Left Side: Interview Stage */}
                <div className={`flex flex-col justify-between items-center p-6 h-full transition-all duration-300 relative z-10 ${
                    showCodeEditor ? "w-full lg:w-1/2 border-r border-slate-200 dark:border-slate-800" : "w-full"
                }`}>
                    <div className="flex items-center justify-between w-full mt-2 z-10 px-4">
                        <div className="flex flex-col gap-0.5">
                            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">AI Interview</p>
                            {userId && (
                                <p className="text-xs text-[#5a6e85] dark:text-[#a0aec0] font-light">
                                    ID: <span className="font-mono bg-white/80 dark:bg-[#1c1e2d] border border-[#d2dfec] dark:border-[#2e324a] px-2 py-0.5 rounded text-blue-600 dark:text-sky-400 select-all">{userId}</span>
                                </p>
                            )}
                        </div>

                        {/* Manual Toggle Code Editor Button */}
                        <button
                            onClick={() => setShowCodeEditor(!showCodeEditor)}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition-all active:scale-95 cursor-pointer"
                            title="Toggle Code Workspace"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                            <span>{showCodeEditor ? "Close Editor" : "Code Editor"}</span>
                        </button>
                    </div>

                    <audio ref={audioRef} autoPlay playsInline />

                    <div className={`flex ${showCodeEditor ? "flex-col sm:flex-row lg:flex-col gap-6" : "flex-col md:flex-row gap-8 md:gap-16"} justify-center items-center w-full z-10 max-w-4xl my-auto py-4 transition-all duration-300`}>
                        {/* AI Avatar with dynamic pulsing aura */}
                        <div className="flex flex-col items-center gap-3">
                            <img className={`${showCodeEditor ? "w-[190px] sm:w-[220px] lg:w-[230px]" : "w-[180px] sm:w-[240px] md:w-[280px]"} aspect-square object-cover rounded-2xl border-4 border-white dark:border-[#2b2e42] shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 bg-white/50 dark:bg-[#161822]/50 p-2`}
                                style={{
                                    transform: `scale(${1 + (aiVolume / 1000)})`,
                                    boxShadow: aiVolume > 0
                                        ? `0 0 ${aiVolume / 2}px ${aiVolume / 4}px rgba(37, 99, 235, 0.4)`
                                        : '0 8px 30px rgba(0, 0, 0, 0.04)'
                                }} src={aiLogo} alt="ai Logo" />
                            <span className="text-xs font-semibold text-[#5a6e85] dark:text-[#a0aec0] uppercase tracking-wider bg-white/80 dark:bg-[#1c1e2d]/80 px-3 py-1 rounded-full border border-[#d2dfec] dark:border-[#2e324a]">AI Interviewer</span>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                            <img className={`${showCodeEditor ? "w-[190px] sm:w-[220px] lg:w-[230px]" : "w-[180px] sm:w-[240px] md:w-[280px]"} aspect-square object-cover rounded-2xl border-4 border-white dark:border-[#2b2e42] shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 bg-white/50 dark:bg-[#161822]/50 p-2`}
                                style={{
                                    transform: `scale(${1 + (userVolume / 1000)})`,
                                    boxShadow: userVolume > 0
                                        ? `0 0 ${userVolume / 2}px ${userVolume / 4}px rgba(37, 99, 235, 0.4)`
                                        : '0 8px 30px rgba(0, 0, 0, 0.04)'
                                }} src={userLogo} alt="person logo" />
                            <span className="text-xs font-semibold text-[#5a6e85] dark:text-[#a0aec0] uppercase tracking-wider bg-white/80 dark:bg-[#1c1e2d]/80 px-3 py-1 rounded-full border border-[#d2dfec] dark:border-[#2e324a]">Candidate</span>
                        </div>
                    </div>

                    {/* Bottom Controls Row: Mic + End Call */}
                    <div className="flex items-center justify-center gap-4 w-full max-w-xs mb-4 z-10">
                        {/* Mic Mute/Unmute Button */}
                        <button
                            onClick={handleMicToggle}
                            title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                            className={`flex items-center justify-center w-12 h-12 rounded-2xl border transition-all duration-200 active:scale-95 cursor-pointer shadow-md ${
                                isMicMuted
                                    ? "bg-red-600/20 border-red-500/40 text-red-400 hover:bg-red-600/30"
                                    : "bg-white/10 dark:bg-white/5 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white/20"
                            }`}
                        >
                            {isMicMuted ? (
                                // Mic Off
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" y1="1" x2="23" y2="23"/>
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                                    <line x1="12" y1="19" x2="12" y2="23"/>
                                    <line x1="8" y1="23" x2="16" y2="23"/>
                                </svg>
                            ) : (
                                // Mic On
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                    <line x1="12" y1="19" x2="12" y2="23"/>
                                    <line x1="8" y1="23" x2="16" y2="23"/>
                                </svg>
                            )}
                        </button>

                        {/* End Call Button */}
                        <button onClick={handleEndCall} className="cursor-pointer flex items-center justify-center gap-2 flex-1 py-3.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 active:scale-95 text-white font-semibold rounded-2xl shadow-[0_4px_20px_rgba(239,68,68,0.15)] border border-red-500/20 transition-all duration-300">
                            <svg xmlns="http://w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5 rotate-[135deg]">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-4.5a2.25 2.25 0 00-2.25-2.25H18.75a2.25 2.25 0 00-2.25 2.25v.75A11.25 11.25 0 016.75 6.75H7.5a2.25 2.25 0 002.25-2.25v-2.25A2.25 2.25 0 007.5 2.25H5.25a2.25 2.25 0 00-2.25 2.25v2.25z" />
                            </svg>
                            <span>End Call</span>
                        </button>
                    </div>
                </div>

                {/* Right Side: Split Screen Code Editor */}
                {showCodeEditor && (
                    <div className="w-full lg:w-1/2 h-full z-20 animate-in slide-in-from-right duration-300">
                        <CodeEditorModal
                            isOpen={showCodeEditor}
                            onClose={() => setShowCodeEditor(false)}
                            initialLanguage={editorLanguage}
                            questionPrompt={questionPrompt}
                            onSubmitCode={(code, lang) => {
                                console.log(`Candidate submitting ${lang} code to AI Interviewer:`, code);
                                if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
                                    dataChannelRef.current.send(JSON.stringify({
                                        type: "SUBMIT_CODE",
                                        language: lang,
                                        code: code
                                    }));
                                } else {
                                    console.warn("DataChannel not open to submit code");
                                }
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
