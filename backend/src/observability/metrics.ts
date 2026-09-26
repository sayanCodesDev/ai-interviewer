import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

/** Live calls on this instance. The signal to scale on. */
export const activeInterviews = new client.Gauge({ name: "ai_interviewer_active_interviews", help: "Interviews with a live call on this instance", registers: [registry] });

export const interviewsFinished = new client.Counter({
    name: "ai_interviewer_interviews_finished_total",
    help: "Interviews that ended, by reason",
    labelNames: ["reason"],
    registers: [registry],
});

const latencyBuckets = [150, 300, 500, 800, 1200, 1800, 2500, 4000, 8000];

/** From the candidate finishing a sentence to the interviewer's first sentence being ready. */
export const firstSentenceMs = new client.Histogram({ name: "ai_interviewer_first_sentence_ms", help: "Model latency to the first spoken sentence", buckets: latencyBuckets, registers: [registry] });

/** From the candidate finishing to the first audio reaching the audio queue. The number a candidate feels. */
export const firstAudioMs = new client.Histogram({ name: "ai_interviewer_first_audio_ms", help: "Latency from turn start to first audio", buckets: latencyBuckets, registers: [registry] });

export const codeRuns = new client.Counter({ name: "ai_interviewer_code_runs_total", help: "Sandboxed code runs, by outcome", labelNames: ["outcome"], registers: [registry] });

export const llmErrors = new client.Counter({ name: "ai_interviewer_llm_errors_total", help: "Model calls that failed", labelNames: ["stage"], registers: [registry] });

export const reportsGenerated = new client.Counter({ name: "ai_interviewer_reports_total", help: "Reports generated, by outcome", labelNames: ["outcome"], registers: [registry] });

// ---- voice quality: the numbers behind "the voice is choppy"

const smallBuckets = [20, 50, 100, 200, 400, 800, 1500, 3000];

/** How long the start of a reply was held back to build the buffer. This is the latency the smoothness costs. */
export const speechStartWaitMs = new client.Histogram({ name: "ai_interviewer_speech_start_wait_ms", help: "Time the start of a reply was buffered before playing", buckets: smallBuckets, registers: [registry] });

/** Speech that ran dry in the middle of a reply and resumed after this long. Each one is an audible pause. */
export const speechGapMs = new client.Histogram({ name: "ai_interviewer_speech_gap_ms", help: "Pauses inside a reply caused by audio arriving late", buckets: smallBuckets, registers: [registry] });

/** How late the 20 ms audio clock ticks ran. A busy server shows up here first. */
export const pacerLatenessMs = new client.Histogram({ name: "ai_interviewer_pacer_lateness_ms", help: "Lateness of the audio pacer's ticks", buckets: [1, 2, 5, 10, 20, 40, 80, 160], registers: [registry] });

/** From sending a sentence to the synthesiser to its first audio coming back. */
export const ttsFirstAudioMs = new client.Histogram({ name: "ai_interviewer_tts_first_audio_ms", help: "Speech synthesis time to first audio", buckets: latencyBuckets, registers: [registry] });

/** What listeners actually experienced, as measured by their own browsers (sampled every few seconds during a call). */
export const clientLossPercent = new client.Histogram({ name: "ai_interviewer_client_packet_loss_percent", help: "Share of the interviewer's voice packets lost on the way to the browser", buckets: [0.5, 1, 2, 5, 10, 20, 50], registers: [registry] });
export const clientConcealedPercent = new client.Histogram({ name: "ai_interviewer_client_concealed_audio_percent", help: "Share of the interviewer's voice the browser had to invent to hide gaps", buckets: [0.5, 1, 2, 5, 10, 20, 50], registers: [registry] });
export const weakConnectionWindows = new client.Counter({ name: "ai_interviewer_weak_connection_windows_total", help: "Measurement windows in which a listener's voice was breaking up", registers: [registry] });
