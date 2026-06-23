import { RTCPeerConnection } from 'werift';
import express from "express";
import OpusScript from "opusscript";
import { STT } from "./services/stt"
import {LLM} from "@/src/services/llm"

const router = express.Router();

// Context markers for text stitching and voice gap filtering
let currentUtterance = "";
let speechTimeout: NodeJS.Timeout | null = null;
const SILENCE_THRESHOLD_MS = 1500; // Wait 1.5s to confirm candidate has finished speaking

// Active AbortController instance tracking ongoing streaming loops on the global scope
let groqAbortController: AbortController | null = null;

router.post("/api/webrtc/offer", async function WebrtcConnection(req, res) {
    try {
        const decoder = new OpusScript(
            48000,              // sample rate
            1,                  // channels
            OpusScript.Application.AUDIO
        );

        const { sdp, type } = req.body;

        if (!sdp || !type) {
            res.status(400).send('Missing SDP or type parameters');
            return;
        }

        // 1. Initialize the server-side RTCPeerConnection
        // Google's public STUN server helps discover public network routes
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        const dgConnection = await STT();

        // 3. Process Text Out of Deepgram Pipeline
        if (dgConnection) {
            dgConnection.on("message", (response: any) => {
                try {
                    const transcript = response.channel?.alternatives?.[0]?.transcript;

                    if (transcript && transcript.trim().length > 0) {

                        // ===================================================================
                        // LIVE BARGE-IN TRIGGER (Cuts off the LLM immediately if user speaks)
                        // ===================================================================
                        if (groqAbortController) {
                            console.log("\n⚠️ [USER INTERRUPTED]: Terminating Groq streaming generation instantly...");
                            groqAbortController.abort(); // Drops the open network stream connection
                            groqAbortController = null;
                        }

                        if (response.is_final) {
                            currentUtterance += " " + transcript.trim();
                            console.log(`[Stitching Sentence]: ${currentUtterance.trim()}`);

                            if (speechTimeout) clearTimeout(speechTimeout);

                            // Turn detection timer block
                            speechTimeout = setTimeout(async () => {
                                const finalAnswer = currentUtterance.trim();
                                if (finalAnswer.length === 0) return;

                                console.log(`\n=== User finished speaking: "${finalAnswer}" ===`);

                                currentUtterance = "";

                                // Instantiate a fresh abort signal sequence wrapper
                                groqAbortController = new AbortController();
                                const currentSignal = groqAbortController.signal; // Capture local snapshot sentinel

                                console.log("Invoking Ultra-Low Latency Groq Streaming Engine...");

                                process.stdout.write("[GROQ INTERVIEWER]: ");
                                // Invoke the extracted architecture file
                                await LLM(
                                    finalAnswer,
                                    currentSignal,
                                    {
                                        onToken: (token) => {
                                            // Handle raw tokens character-by-character live here
                                            process.stdout.write(token);

                                            // =========================================================
                                            // TODO: PIPE TO YOUR TTS ENGINE HERE
                                            // send token directly down your voice streaming channel
                                            // =========================================================
                                        },
                                        onComplete: (fullText) => {
                                            console.log("\n"); // Clear newline break on successful wrap up
                                            if (groqAbortController?.signal === currentSignal) {
                                                groqAbortController = null;
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
                    //  Get the raw compressed Opus packet payload directly from the network
                    const rawOpusPayload = Buffer.from(rtp.payload);

                    //  Instantly pipe it to Deepgram with ZERO local processing latency
                    if (dgConnection.socket && dgConnection.socket.readyState === 1) { // 1 = OPEN
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