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
