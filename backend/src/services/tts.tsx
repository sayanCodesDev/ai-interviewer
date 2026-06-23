// import { DeepgramClient } from "@deepgram/sdk";
// import Speaker from  "speaker";
// import {WebSocket} from "ws";
// import "dotenv/config"

// // Configure speaker for linear16 audio playback
// const speaker = new Speaker({
//     channels: 1,
//     bitDepth: 16,
//     sampleRate: 48000,
//     signed: true,
//   }as any);

//   const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
   
//   async function TTS(): Promise<void>{
//         // Create a WebSocket connection to Deepgram TTS
//         const dgConnection = await deepgram.speak.v1.connect({
//             model: "aura-2-thalia-en",
//             encoding: "linear16",
//             sample_rate: 48000
//           } as any);
   
//           // Set up event handlers
//     dgConnection.on('open', () => {
//         console.log('Connection opened');
//         // Send text to be converted to speech
//         dgConnection.sendText({ type: "Text", text: TTS_TEXT });
//       });
  
//   }