import { useEffect } from "react";

export async function Interview() {

    useEffect(() => {
        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Discovers public IPs
            });

            // Capture mic and add tracks
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,       // Force Mono
                }
            });
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Create the initial WebRTC Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send the FULL complete SDP (including embedded ICE candidates) to your server
            const response = await fetch('http://localhost:3001/api/webrtc/offer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
            });

            // Receive the server's complete SDP Answer and apply it
            const answer = await response.json();
            console.log(answer)
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        start()
    }, [])

    return <>
        hii</>
}
