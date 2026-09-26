import { RTCPeerConnection, MediaStreamTrack, RtpHeader, RtpPacket, MediaStream } from 'werift';
import express from "express";
import { STT } from "./services/stt"
import { LLM } from "./services/llm"
import { TTS } from "./services/tts"
import { getSession, dropSession } from "./services/sessionStore";
import { PcmFrameQueue, nextPacingStep, FRAME_BYTES, SAMPLES_PER_FRAME } from "./services/audioQueue";
import { authMiddleware } from "./auth";
import type { AuthenticatedRequest } from "./auth";
import OpusScript from 'opusscript';

const router = express.Router();

// Wait this long after the last final transcript to decide the candidate is done talking.
const SILENCE_THRESHOLD_MS = 1500;

// WebRTC configurations
const TARGET_SAMPLE_RATE = 48000;
const TARGET_CHANNELS = 2;

router.post("/api/webrtc/offer", authMiddleware, async function WebrtcConnection(req: AuthenticatedRequest, res) {
    // Everything below is per-connection state. It must never live in module
    // scope: two candidates interviewing at once would share utterances, abort
    // signals and barge-in flags.
    let encoder: OpusScript | null = null;
    let pc: RTCPeerConnection | null = null;
    let dgConnection: Awaited<ReturnType<typeof STT>> | null = null;
    let dgTtsConnection: any = null;
    let pacingInterval: NodeJS.Timeout | null = null;
    let speechTimeout: NodeJS.Timeout | null = null;
    let groqAbortController: AbortController | null = null;

    // Context marker for stitching interim transcripts into one utterance
    let currentUtterance = "";
    // For barge-in: ignore TTS audio that belongs to an abandoned turn
    let ignoreTtsAudio = false;
    let torndown = false;

    function teardown(reason: string) {
        if (torndown) return;
        torndown = true;
        console.log(`🧹 Releasing interview session resources (${reason})`);

        ignoreTtsAudio = true;

        if (groqAbortController) {
            groqAbortController.abort();
            groqAbortController = null;
        }
        if (speechTimeout) {
            clearTimeout(speechTimeout);
            speechTimeout = null;
        }
        if (pacingInterval) {
            clearInterval(pacingInterval);
            pacingInterval = null;
        }
        try { dgTtsConnection?.close(); } catch (_) { /* already closed */ }
        try { dgConnection?.close(); } catch (_) { /* already closed */ }
        try { pc?.close(); } catch (_) { /* already closed */ }
        try { encoder?.delete?.(); } catch (_) { /* wasm heap already freed */ }
        encoder = null;
    }

    try {
        const userId = req.user!.id;
        const session = getSession(userId);
        if (!session) {
            res.status(409).json({ msg: "No interview session found. Complete the setup form before starting the call." });
            return;
        }

        const { sdp, type } = req.body;
        if (!sdp || !type) {
            res.status(400).send('Missing SDP or type parameters');
            return;
        }

        encoder = new OpusScript(TARGET_SAMPLE_RATE, TARGET_CHANNELS, OpusScript.Application.VOIP);

        // 1. Initialize the server-side RTCPeerConnection
        pc = new RTCPeerConnection({
            iceServers: []
        });
        const peer = pc;

        // Diagnostic Connection State Logs
        peer.oniceconnectionstatechange = () => {
            console.log(`[WebRTC ICE Connection State]: ${peer.iceConnectionState}`);
        };

        // Setup werift Track
        const aiTrack = new MediaStreamTrack({ kind: "audio" });
        peer.addTransceiver(aiTrack, {
            direction: "sendrecv",
            streams: [new MediaStream({ id: 'ai-voice-stream', tracks: [aiTrack] })],
        });

        // Setup DataChannel for UI events (such as code editor popouts and code submissions)
        let dataChannel: any = null;

        peer.ondatachannel = (event: any) => {
            console.log("📡 DataChannel opened with client:", event.channel.label);
            dataChannel = event.channel;

            dataChannel.onmessage = async (e: any) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "END_INTERVIEW") {
                        console.log("\n🛑 END_INTERVIEW received. Shutting down AI session...");
                        // Discard the transcript so the next interview starts fresh
                        dropSession(userId);
                        teardown("END_INTERVIEW");
                        console.log("✅ AI session terminated cleanly.");
                        return;
                    }

                    if (msg.type === "SUBMIT_CODE") {
                        console.log(`\n📥 Candidate submitted ${msg.language} code to AI Interviewer.`);

                        // Cancel ongoing AI speech if any
                        if (groqAbortController || !ignoreTtsAudio) {
                            groqAbortController?.abort();
                            groqAbortController = null;
                            ignoreTtsAudio = true;
                            if (dgTtsConnection && dgTtsConnection.readyState === 1) {
                                dgTtsConnection.sendClear({ type: "Clear" });
                            }
                        }

                        groqAbortController = new AbortController();
                        const currentSignal = groqAbortController.signal;
                        ignoreTtsAudio = false;

                        const promptPayload = `[SUBMITTED CODE (${msg.language})]:\n${msg.code}`;
                        console.log("Evaluating submitted code via LLM...");

                        await LLM(
                            session,
                            promptPayload,
                            currentSignal,
                            {
                                onToken: async (token) => {
                                    if (dgTtsConnection?.readyState === 1 && token.length > 0) {
                                        dgTtsConnection.sendText({ type: "Speak", text: token });
                                    }
                                },
                                onComplete: async (fullText) => {
                                    if (groqAbortController?.signal === currentSignal) {
                                        groqAbortController = null;
                                    }
                                    finalizeTtsTurn(dgTtsConnection);
                                },
                                onEditorTrigger: (language: string, questionText: string) => {
                                    if (dataChannel && dataChannel.readyState === "open") {
                                        dataChannel.send(JSON.stringify({ type: "SHOW_CODE_EDITOR", language, question: questionText }));
                                    }
                                },
                                onHideEditorTrigger: () => {
                                    if (dataChannel && dataChannel.readyState === "open") {
                                        dataChannel.send(JSON.stringify({ type: "HIDE_CODE_EDITOR" }));
                                    }
                                },
                                onError: (err) => {
                                    console.error("Code evaluation error:", err);
                                    speakFallback("Sorry, I hit a technical problem reviewing your code. Could you walk me through your approach instead?");
                                }
                            }
                        );
                    }
                } catch (err) {
                    console.error("Error processing DataChannel message:", err);
                }
            };
        };

        // --- BUFFERING STATE ---
        const FRAME_INTERVAL_MS = 20;
        // If the event loop stalls, catch up at most this much rather than bursting.
        const MAX_CATCHUP_FRAMES = 10;
        const pcm = new PcmFrameQueue();

        // --- RTP STATE ---
        let sequenceNumber = 0;
        let timestamp = 0;
        // Reused for every underrun so the RTP clock never skips (see the pacer).
        const silenceFrame = Buffer.alloc(FRAME_BYTES);
        let wasSilent = true;

        dgConnection = await STT();
        try {
            dgTtsConnection = await TTS();
        } catch (err) {
            console.error("TTS failed to connect, continuing with STT only:", err);
        }

        // Deepgram Connection Health Flags
        let isSttReady = true; // Set to true since await STT() already passed waitForOpen()

        dgConnection.on("close", () => { isSttReady = false; });
        dgConnection.on("error", () => { isSttReady = false; });

        // An LLM failure used to leave the candidate staring at a mute interviewer
        // with nothing in the UI. Say something so the call stays recoverable.
        function speakFallback(message: string) {
            if (dgTtsConnection?.readyState === 1) {
                ignoreTtsAudio = false;
                dgTtsConnection.sendText({ type: "Speak", text: message });
                finalizeTtsTurn(dgTtsConnection);
            }
        }

        // Call this as soon as the LLM text stream completely finishes
        function finalizeTtsTurn(connection: any) {
            if (connection?.readyState === 1) {
                console.log("📨 Sending Flush to Deepgram TTS...");
                connection.sendFlush({ type: "Flush" });
            }
        }

        // ===================================================================
        // 1. INITIALIZE TTS LISTENERS ONCE (NOT INSIDE THE TOKEN LOOP!)
        // ===================================================================
        dgTtsConnection?.on("open", () => {
            console.log("Deepgram TTS Streaming Channel Ready.");
        });

        // RECEIVING AUDIO FROM DEEPGRAM TTS
        // Listen on the RAW WebSocket to get binary audio frames
        // (The SDK's .on("message") runs JSON.parse on everything, which breaks on binary audio)
        const rawTtsSocket = (dgTtsConnection as any)?.socket;
        if (rawTtsSocket) {
            // Override binaryType to nodebuffer so rawData is delivered as a Buffer
            rawTtsSocket.binaryType = "nodebuffer";
            if (rawTtsSocket.socket) {
                rawTtsSocket.socket.binaryType = "nodebuffer";
            }

            rawTtsSocket.addEventListener("message", async (event: any) => {
                // Discard any incoming audio frames from a previously interrupted turn
                if (ignoreTtsAudio) return;
                let rawData = event.data;

                // Handle Blob conversion if it still arrives as a Blob
                if (typeof Blob !== "undefined" && rawData instanceof Blob) {
                    rawData = Buffer.from(await rawData.arrayBuffer());
                }

                // Binary audio frame
                // NOTE: do not log per frame here. A synchronous process.stdout.write on
                // this path blocks the event loop hundreds of times a second and was a
                // direct cause of the audio freezing mid-sentence.
                if (Buffer.isBuffer(rawData) || rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
                    const monoBuffer = Buffer.isBuffer(rawData)
                        ? rawData
                        : Buffer.from(rawData instanceof ArrayBuffer ? rawData : rawData.buffer);
                    pcm.enqueueMono(monoBuffer);
                } else if (typeof rawData === "string") {
                    // JSON control message
                    try {
                        const parsed = JSON.parse(rawData);
                        if (parsed.type === "Metadata") {
                            console.log("\n[TTS] Started speaking...");
                        } else if (parsed.type === "Flushed") {
                            console.log("\n[TTS] Finished speaking turn.");
                        } else if (parsed.type === "Warning") {
                            console.warn("\n[TTS Warning]:", parsed.description);
                        }
                    } catch (e) {
                        // If it's not JSON, treat as base64 audio (fallback)
                        pcm.enqueueMono(Buffer.from(rawData, "base64"));
                    }
                }
            });
        }

        // ===================================================================
        // 2. RUN THE 20MS PACING PACEMAKER CONTINUOUSLY
        // ===================================================================
        // Emits exactly one 20ms packet. Sends silence on underrun rather than nothing:
        // the old pacer returned early, so the RTP timestamp stopped advancing across a
        // gap. The browser then received a stream whose timestamps claimed the audio was
        // continuous while it arrived late, desynchronising its playout clock — heard as
        // the voice freezing and then resuming mid-word. Feeding silence through the same
        // encoder also keeps its internal state coherent, avoiding clicks when speech
        // resumes.
        function sendFrame(): void {
            if (!encoder) return;

            const pcmFrame = pcm.readFrame();
            const isSilence = pcmFrame === null;

            try {
                const opusFrame = encoder.encode(pcmFrame ?? silenceFrame, SAMPLES_PER_FRAME);

                const header = new RtpHeader({
                    version: 2,
                    padding: false,
                    extension: false,
                    // Marks the first packet of a new talkspurt.
                    marker: wasSilent && !isSilence,
                    payloadType: 111, // Opus
                    sequenceNumber: (sequenceNumber++) & 0xffff,
                    timestamp: (timestamp += SAMPLES_PER_FRAME),
                    ssrc: 98765,
                });
                aiTrack.writeRtp(new RtpPacket(header, opusFrame));
                wasSilent = isSilence;
            } catch (err) {
                console.error("Failed encoding/transmitting Opus frame:", err);
            }
        }

        // Tick faster than the frame rate and send whatever is due. setInterval drifts
        // and coalesces under load, so pacing one frame per tick lost real time; this
        // catches back up instead.
        let nextFrameDueAt = Date.now();
        pacingInterval = setInterval(() => {
            const step = nextPacingStep(Date.now(), nextFrameDueAt, FRAME_INTERVAL_MS, MAX_CATCHUP_FRAMES);
            nextFrameDueAt = step.nextDueAt;
            for (let i = 0; i < step.frames; i++) sendFrame();
        }, 5);

        // 3. Process Text Out of Deepgram Pipeline
        dgConnection.on("message", (response: any) => {
            try {
                const transcript = response.channel?.alternatives?.[0]?.transcript;

                if (transcript && transcript.trim().length > 0) {

                    // ===================================================================
                    // LIVE BARGE-IN TRIGGER (Cuts off the LLM immediately if user speaks)
                    // ===================================================================
                    if (groqAbortController || !ignoreTtsAudio) {
                        console.log("\n [USER INTERRUPTED]: Terminating Groq streaming generation instantly...");
                        groqAbortController?.abort(); // Drops the open network stream connection
                        groqAbortController = null;

                        // Tell the socket to ignore any remaining in-flight audio frames
                        ignoreTtsAudio = true;
                        pcm.reset();

                        if (dgTtsConnection && dgTtsConnection.readyState === 1) {
                            dgTtsConnection.sendClear({ type: "Clear" });
                        }
                    }

                    if (response.is_final) {
                        currentUtterance += " " + transcript.trim();
                        console.log(`[Stitching Sentence]: ${currentUtterance.trim()}`);

                        if (speechTimeout) clearTimeout(speechTimeout);

                        // Turn detection timer block
                        speechTimeout = setTimeout(async () => {
                            const finalAnswer = currentUtterance.trim();

                            if (finalAnswer.length === 0) return;
                            if (torndown) return;

                            console.log(`\n=== User finished speaking: "${finalAnswer}" ===`);

                            currentUtterance = "";

                            // Instantiate a fresh abort signal sequence wrapper
                            groqAbortController = new AbortController();
                            const currentSignal = groqAbortController.signal; // Capture local snapshot sentinel

                            // Reset the flag so we accept audio for this new response
                            ignoreTtsAudio = false;

                            console.log("Invoking Ultra-Low Latency Groq Streaming Engine...");
                            process.stdout.write("[GROQ INTERVIEWER]: ");

                            await LLM(
                                session,
                                finalAnswer,
                                currentSignal,
                                {
                                    onToken: async (token) => {
                                        // Handle raw tokens character-by-character live here
                                        process.stdout.write(token);
                                        // Securely feed the token down the open TTS websocket channel
                                        if (dgTtsConnection?.readyState === 1 && token.length > 0) {
                                            dgTtsConnection.sendText({ type: "Speak", text: token });
                                        }
                                    },
                                    onComplete: async (fullText) => {
                                        console.log("\n"); // Clear newline break on successful wrap up
                                        if (groqAbortController?.signal === currentSignal) {
                                            groqAbortController = null;
                                        }
                                        finalizeTtsTurn(dgTtsConnection);
                                    },
                                    onEditorTrigger: (language: string, questionText: string) => {
                                        console.log(`💻 [CODE EDITOR TRIGGERED]: Opening editor for language: ${language}`);
                                        if (dataChannel && dataChannel.readyState === "open") {
                                            dataChannel.send(JSON.stringify({
                                                type: "SHOW_CODE_EDITOR",
                                                language: language,
                                                question: questionText
                                            }));
                                        }
                                    },
                                    onHideEditorTrigger: () => {
                                        console.log(`🔒 [CODE EDITOR HIDE TRIGGERED]: Closing editor for candidate`);
                                        if (dataChannel && dataChannel.readyState === "open") {
                                            dataChannel.send(JSON.stringify({
                                                type: "HIDE_CODE_EDITOR"
                                            }));
                                        }
                                    },
                                    onError: (err) => {
                                        console.error("\nGroq Core Stream Exception:", err);
                                        speakFallback("Sorry, I ran into a technical problem on my end. Could you repeat that?");
                                    }
                                }
                            );
                        }, SILENCE_THRESHOLD_MS);
                    }
                }
            } catch (err) {
                console.error("Error processing text for Groq:", err);
            }
        });

        dgConnection.on("error", (err: any) => {
            console.error("Deepgram Connection Malfunction:", err);
        });

        peer.ontrack = (event: any) => {
            console.log("Receiving real-time Opus stream from frontend...");
            event.track.onReceiveRtp.subscribe((rtp: any) => {
                try {
                    const rawOpusPayload = Buffer.from(rtp.payload);
                    //  Instantly pipe it to Deepgram with ZERO local processing latency
                    if (dgConnection && isSttReady && dgConnection.readyState === 1) {
                        dgConnection.socket.send(rawOpusPayload);
                    }
                } catch (err) {
                    console.error("Direct Streaming Error:", err);
                }
            });
        };

        // Release every per-connection resource once the call drops, not just the pacer
        peer.onconnectionstatechange = () => {
            console.log(`[WebRTC Connection State]: ${peer.connectionState}`);
            if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed' ||
                peer.connectionState === 'closed') {
                teardown(`connection ${peer.connectionState}`);
            }
        };

        // 4. Set the client's SDP description as the Remote Description
        await peer.setRemoteDescription({ type, sdp });

        // 5. Create an Answer matching the offer's capabilities
        const answer = await peer.createAnswer();

        // 6. Set the generated Answer as the Local Description
        await peer.setLocalDescription(answer);

        // 7. Return the finalized SDP answer back to the browser
        res.status(200).json({
            sdp: peer.localDescription?.sdp,
            type: peer.localDescription?.type
        });
    } catch (e) {
        console.error('Error during WebRTC handshake:', e);
        teardown("handshake error");
        if (!res.headersSent) {
            res.status(500).send('Internal WebRTC Handshake Error');
        }
    }
})
export default router;
