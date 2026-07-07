import { useEffect, useRef } from "react";

export function Interview() {

    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {

        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [] // Discovers public IPs
            });

            pc.onconnectionstatechange = () => console.log("PC state:", pc.connectionState);
            pc.oniceconnectionstatechange = () => console.log("ICE state:", pc.iceConnectionState);

            // Capture mic and add tracks
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,       // Force Mono
                }
            });

            stream?.getTracks().forEach(track => pc.addTrack(track, stream!));

            // 3. LISTEN FOR THE INBOUND AI AUDIO TRACK
            // On your React Frontend:
            pc.ontrack = (event) => {
                console.log("📥 Received audio track from server!");

                if (audioRef.current) {
                    // FIX: Wrap the bare track in a MediaStream so the browser can play it
                    const inboundStream = new MediaStream([event.track]);
                    audioRef.current.srcObject = inboundStream;

                    // Force play to bypass browser autoplay restrictions
                    audioRef.current.play().catch(err => console.error("Autoplay blocked:", err));
                }
            };

            // Create the initial WebRTC Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send the FULL complete SDP (including embedded ICE candidates) to your server
            const response = await fetch("http://localhost:3001/api/webrtc/offer", {
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

        }
        start();

    }, [])

    return <>
        <audio ref={audioRef} autoPlay playsInline />
        hii</>
}
