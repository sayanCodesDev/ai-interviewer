import { RTCPeerConnection, MediaStreamTrack, RtpHeader, RtpPacket, MediaStream } from 'werift';
import express from "express";
import { STT } from "./services/stt"
import { LLM } from "@/src/services/llm"
import { TTS } from "@/src/services/tts"
import OpusScript from 'opusscript';

const router = express.Router();

// Context markers for text stitching and voice gap filtering
let currentUtterance = "";
let speechTimeout: NodeJS.Timeout | null = null;
const SILENCE_THRESHOLD_MS = 1500; // Wait 1.5s to confirm candidate has finished speaking

// Active AbortController instance tracking ongoing streaming loops on the global scope
let groqAbortController: AbortController | null = null;

// For barge-in: ignore TTS audio when user is speaking
let ignoreTtsAudio = false;

// WebRTC configurations
const TARGET_SAMPLE_RATE = 48000;
const TARGET_CHANNELS = 2;

router.post("/api/webrtc/offer", async function WebrtcConnection(req, res) {
    try {
        const encoder = new OpusScript(TARGET_SAMPLE_RATE, TARGET_CHANNELS, OpusScript.Application.VOIP);

        const { sdp, type } = req.body;

        if (!sdp || !type) {
            res.status(400).send('Missing SDP or type parameters');
            return;
        }

        // 1. Initialize the server-side RTCPeerConnection
        // Google's public STUN server helps discover public network routes
        const pc = new RTCPeerConnection({
            iceServers: []
        });
        // Diagnostic Connection State Logs
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC ICE Connection State]: ${pc.iceConnectionState}`);
        };

        // Setup werift Track
        const aiTrack = new MediaStreamTrack({ kind: "audio" });
        pc.addTransceiver(aiTrack, {
            direction: "sendrecv",
            streams: [new MediaStream({ id: 'ai-voice-stream', tracks: [aiTrack] })],
        });

        // Setup DataChannel for UI events (such as code editor popouts and code submissions)
        let dataChannel: any = null;
        let dgTtsConnection: any = null;

        pc.ondatachannel = (event: any) => {
            console.log("📡 DataChannel opened with client:", event.channel.label);
            dataChannel = event.channel;

            dataChannel.onmessage = async (e: any) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === "END_INTERVIEW") {
                        console.log("\n🛑 END_INTERVIEW received. Shutting down AI session...");
                        // Abort any running LLM stream
                        if (groqAbortController) {
                            groqAbortController.abort();
                            groqAbortController = null;
                        }
                        ignoreTtsAudio = true;
                        // Close Deepgram TTS
                        if (dgTtsConnection && dgTtsConnection.readyState === 1) {
                            try { dgTtsConnection.requestClose(); } catch (_) {}
                        }
                        // Clear pacing timer
                        if (pacingInterval) {
                            clearInterval(pacingInterval);
                            pacingInterval = null;
                        }
                        // Close PeerConnection
                        try { pc.close(); } catch (_) {}
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
                                onError: (err) => console.error("Code evaluation error:", err)
                            }
                        );
                    }
                } catch (err) {
                    console.error("Error processing DataChannel message:", err);
                }
            };
        };

        // --- BUFFERING STATE ---
        let pcmAudioBuffer = Buffer.alloc(0);
        const WEBRTC_FRAME_SIZE = 960; // 20ms of audio samples at 48kHz
        const REQUIRED_BYTE_SIZE = 3840; // 960 samples * 2 channels * 2 bytes

        // --- RTP STATE ---
        let sequenceNumber = 0;
        let timestamp = 0;
        let pacingInterval: NodeJS.Timeout | null = null;

        const dgConnection = await STT();
        try {
            dgTtsConnection = await TTS();
        } catch (err) {
            console.error("TTS failed to connect, continuing with STT only:", err);
        }

        // Deepgram Connection Health Flags
        let isSttReady = true; // Set to true since await STT() already passed waitForOpen()

        dgConnection.on("close", () => { isSttReady = false; });
        dgConnection.on("error", () => { isSttReady = false; });

        // Helper: Interleave Mono to Stereo
        function convertMonoToStereo16Bit(monoSamples: Int16Array): Buffer {
            const stereoBuffer = Buffer.alloc(monoSamples.length * 2 * 2);
            let offset = 0;

            for (let i = 0; i < monoSamples.length; i++) {
                const sample = monoSamples[i];
                if (sample === undefined) continue;
                stereoBuffer.writeInt16LE(sample, offset);      // Left Channel
                stereoBuffer.writeInt16LE(sample, offset + 2);  // Right Channel
                offset += 4;
            }
            return stereoBuffer;
        }
        // Call this as soon as your LLM text stream completely finishes (e.g., on completion)
        function finalizeTtsTurn(dgTtsConnection: any) {
            if (dgTtsConnection?.readyState === 1) {
                console.log("📨 Sending Flush to Deepgram TTS...");
                dgTtsConnection.sendFlush({ type: "Flush" });
            }
        }
        // ===================================================================
        // 1. INITIALIZE TTS LISTENERS ONCE (NOT INSIDE THE TOKEN LOOP!)
        // ===================================================================
        dgTtsConnection?.on("open", () => {
            console.log("Deepgram TTS Streaming Channel Ready.");
        });

        // 1. RECEIVING AUDIO FROM DEEPGRAM TTS
        // Listen on the RAW WebSocket to get binary audio frames
        // (The SDK's .on("message") runs JSON.parse on everything, which breaks on binary audio)
        // 1. RECEIVING AUDIO FROM DEEPGRAM TTS
        // Listen on the RAW WebSocket to get binary audio frames
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
                if (Buffer.isBuffer(rawData) || rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
                    process.stdout.write("🎵");
                    const monoBuffer = Buffer.isBuffer(rawData)
                        ? rawData
                        : Buffer.from(rawData instanceof ArrayBuffer ? rawData : rawData.buffer);

                    const monoSamples = new Int16Array(
                        monoBuffer.buffer.slice(
                            monoBuffer.byteOffset,
                            monoBuffer.byteOffset + monoBuffer.byteLength
                        )
                    );
                    const stereoBuffer = convertMonoToStereo16Bit(monoSamples);
                    pcmAudioBuffer = Buffer.concat([pcmAudioBuffer, stereoBuffer]);
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
                        const monoBuffer = Buffer.from(rawData, "base64");
                        const monoSamples = new Int16Array(
                            monoBuffer.buffer.slice(
                                monoBuffer.byteOffset,
                                monoBuffer.byteOffset + monoBuffer.byteLength
                            )
                        );
                        const stereoBuffer = convertMonoToStereo16Bit(monoSamples);
                        pcmAudioBuffer = Buffer.concat([pcmAudioBuffer, stereoBuffer]);
                    }
                }
            });
        }
        // ===================================================================
        // 2. RUN THE 20MS PACING PACEMAKER CONTINUOUSLY
        // ===================================================================
        pacingInterval = setInterval(() => {
            if (pcmAudioBuffer.length < REQUIRED_BYTE_SIZE) return;

            const chunkToSend = pcmAudioBuffer.subarray(0, REQUIRED_BYTE_SIZE);
            pcmAudioBuffer = pcmAudioBuffer.subarray(REQUIRED_BYTE_SIZE);

            try {
                const opusFrame = encoder.encode(chunkToSend, WEBRTC_FRAME_SIZE);

                const header = new RtpHeader({
                    version: 2,
                    padding: false,
                    extension: false,
                    marker: false,
                    payloadType: 111, // Opus
                    sequenceNumber: (sequenceNumber++) & 0xffff,
                    timestamp: (timestamp += WEBRTC_FRAME_SIZE),
                    ssrc: 98765,
                });
                const packet = new RtpPacket(header, opusFrame);
                aiTrack.writeRtp(packet);
            } catch (err) {
                console.error("Failed encoding/transmitting Opus frame:", err);
            }
        }, 20);

        // 3. Process Text Out of Deepgram Pipeline
        if (dgConnection) {

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
                            pcmAudioBuffer = Buffer.alloc(0);

                            if (dgTtsConnection && dgTtsConnection.readyState === 1) {
                                dgTtsConnection.sendClear({ type: "Clear" });
                            }
                        }


                        if (response.is_final) {
                            currentUtterance += " " + transcript.trim();
                            console.log(`[Stitching Sentence]: ${currentUtterance.trim()}`);

                            if (speechTimeout) clearTimeout(speechTimeout);

                            // Turn detection timer block
                            speechTimeout = setTimeout(async () => {        //speechTimeout contain the unique timer id
                                const finalAnswer = currentUtterance.trim();

                                if (finalAnswer.length === 0) return;

                                console.log(`\n=== User finished speaking: "${finalAnswer}" ===`);

                                currentUtterance = "";

                                // Instantiate a fresh abort signal sequence wrapper
                                groqAbortController = new AbortController();
                                const currentSignal = groqAbortController.signal; // Capture local snapshot sentinel

                                // Reset the flag so we accept audio for this new response
                                ignoreTtsAudio = false;

                                console.log("Invoking Ultra-Low Latency Groq Streaming Engine...");

                                process.stdout.write("[GROQ INTERVIEWER]: ");
                                // Invoke the extracted architecture file
                                console.log("============================", finalAnswer, " ============================")
                                await LLM(
                                    finalAnswer,
                                    currentSignal,
                                    {
                                        onToken: async (token) => {
                                            // Handle raw tokens character-by-character live here
                                            process.stdout.write(token);
                                            // =========================================================
                                            // Securely feed the token down the open TTS websocket channel
                                            if (dgTtsConnection?.readyState === 1 && token.length > 0) {
                                                dgTtsConnection.sendText({ type: "Speak", text: token });
                                            }
                                            // =========================================================
                                        },
                                        onComplete: async (fullText) => {
                                            console.log("\n"); // Clear newline break on successful wrap up
                                            if (groqAbortController?.signal === currentSignal) {
                                                groqAbortController = null;
                                            }
                                            finalizeTtsTurn(dgTtsConnection)

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
        }

        pc.ontrack = (event: any) => {
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

        // 3. Set the client's SDP description as the Remote Description
        await pc.setRemoteDescription({ type, sdp });

        // 4. Create an Answer matching the offer's capabilities
        const answer = await pc.createAnswer();

        // 5. Set the generated Answer as the Local Description
        await pc.setLocalDescription(answer);

        // Clean up pacing structures if connection drops down the line
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC Connection State]: ${pc.connectionState}`);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' ||
                pc.connectionState === 'closed') {
                if (pacingInterval) clearInterval(pacingInterval);
            }
        };

        // 6. Return the finalized SDP answer back to the browser
        res.status(200).json({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type
        });
    } catch (e) {
        console.error('Error during WebRTC handshake:', e);
        res.status(500).send('Internal WebRTC Handshake Error');
    }
})
export default router;