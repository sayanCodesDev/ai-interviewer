import "dotenv/config";
import crypto from "node:crypto";
import { z } from "zod";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:3000"];

/** Blank values in .env (`KEY=`) should behave like the variable being unset. */
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const optionalInt = (fallback: number) =>
    z.preprocess((value) => (value === "" || value === undefined ? undefined : value), z.coerce.number().int().min(0).default(fallback));

const booleanFlag = (fallback: boolean) =>
    z.preprocess(
        (value) => (typeof value === "string" ? ["1", "true", "yes", "on"].includes(value.toLowerCase()) : value),
        z.boolean().default(fallback),
    );

const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: optionalInt(2000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    DATABASE_URL: optionalString,
    TEST_DATABASE_URL: optionalString,
    DATABASE_POOL_MAX: optionalInt(10),

    JWT_SECRET: optionalString,
    ALLOWED_ORIGINS: optionalString,
    /** Number of reverse-proxy hops in front of the API (so req.ip is the real client). */
    TRUST_PROXY: optionalString,
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_DOMAIN: optionalString,

    DEEPGRAM_API_KEY: optionalString,
    GROQ_API_KEY: optionalString,
    GROQ_MODEL: z.string().default("qwen/qwen3.8-27b"),
    GROQ_EVAL_MODEL: optionalString,

    CODE_RUNNER: z.enum(["auto", "docker", "local"]).default("auto"),
    RUNNER_IMAGE: z.string().default("ai-interviewer-runner:latest"),
    RUNNER_CONCURRENCY: optionalInt(4),
    RUNNER_MEMORY_MB: optionalInt(256),
    RUNNER_CPUS: z.coerce.number().positive().default(1),
    ALLOW_UNSAFE_LOCAL_EXEC: booleanFlag(false),

    MAX_CONCURRENT_INTERVIEWS: optionalInt(20),
    MAX_INTERVIEWS_PER_DAY: optionalInt(5),
    DATA_RETENTION_DAYS: optionalInt(180),
    REPORT_WORKER_ENABLED: booleanFlag(true),

    WEBRTC_PUBLIC_IP: optionalString,
    WEBRTC_PORT_MIN: optionalInt(0),
    WEBRTC_PORT_MAX: optionalInt(0),
    STUN_URLS: optionalString,

    METRICS_TOKEN: optionalString,
});

export interface AppConfig {
    nodeEnv: "development" | "test" | "production";
    isProduction: boolean;
    isTest: boolean;
    port: number;
    logLevel: string;

    databaseUrl: string;
    databasePoolMax: number;

    jwtSecret: string;
    allowedOrigins: string[];
    trustProxy: boolean | number | string;
    cookieSameSite: "lax" | "strict" | "none";
    cookieDomain?: string;

    deepgramApiKey?: string;
    groqApiKey?: string;
    groqModel: string;
    groqEvalModel: string;

    codeRunner: "auto" | "docker" | "local";
    runnerImage: string;
    runnerConcurrency: number;
    runnerMemoryMb: number;
    runnerCpus: number;

    maxConcurrentInterviews: number;
    maxInterviewsPerDay: number;
    dataRetentionDays: number;
    reportWorkerEnabled: boolean;

    webrtcPublicIp?: string;
    webrtcPortRange?: [number, number];
    stunUrls: string[];

    metricsToken?: string;
}

function parseTrustProxy(raw: string | undefined): boolean | number | string {
    if (!raw) return false;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw;
}

/**
 * Validates the environment once, at boot. A production server that is missing a
 * secret should refuse to start rather than fail on the first request.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn): AppConfig {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
        throw new Error(`Invalid environment configuration:\n${details}`);
    }
    const raw = parsed.data;
    const isProduction = raw.NODE_ENV === "production";
    const isTest = raw.NODE_ENV === "test";
    const problems: string[] = [];

    // Tests must never touch a real database, whatever DATABASE_URL says.
    const databaseUrl = isTest ? raw.TEST_DATABASE_URL : raw.DATABASE_URL;
    if (!databaseUrl) {
        problems.push(isTest ? "TEST_DATABASE_URL is required when NODE_ENV=test" : "DATABASE_URL is required");
    } else if (isTest) {
        const host = new URL(databaseUrl).hostname;
        if (!LOCAL_HOSTS.has(host)) problems.push(`TEST_DATABASE_URL must point at a local database, got host "${host}"`);
    }

    let jwtSecret = raw.JWT_SECRET;
    if (!jwtSecret) {
        if (isProduction) {
            problems.push("JWT_SECRET is required in production");
        } else {
            warn("[config] JWT_SECRET is not set. Using a random per-process secret, so sign-ins reset on every restart.");
            jwtSecret = crypto.randomBytes(32).toString("hex");
        }
    } else if (isProduction && jwtSecret.length < 32) {
        problems.push("JWT_SECRET must be at least 32 characters in production");
    }

    const allowedOrigins = raw.ALLOWED_ORIGINS
        ? raw.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
        : DEV_ORIGINS;
    if (isProduction && !raw.ALLOWED_ORIGINS) problems.push("ALLOWED_ORIGINS is required in production");

    if (raw.COOKIE_SAMESITE === "none" && !isProduction) {
        warn("[config] COOKIE_SAMESITE=none needs HTTPS to work; browsers drop the cookie over plain http.");
    }

    if (isProduction) {
        if (!raw.GROQ_API_KEY) problems.push("GROQ_API_KEY is required in production");
        if (!raw.DEEPGRAM_API_KEY) problems.push("DEEPGRAM_API_KEY is required in production");
        if (raw.CODE_RUNNER === "local" && !raw.ALLOW_UNSAFE_LOCAL_EXEC) {
            problems.push("CODE_RUNNER=local runs candidate code on this machine. Use docker, or set ALLOW_UNSAFE_LOCAL_EXEC=true to accept the risk.");
        }
    }

    const portMin = raw.WEBRTC_PORT_MIN;
    const portMax = raw.WEBRTC_PORT_MAX;
    if ((portMin && !portMax) || (!portMin && portMax) || portMin > portMax) {
        problems.push("WEBRTC_PORT_MIN and WEBRTC_PORT_MAX must both be set, with MIN <= MAX");
    }

    if (problems.length > 0) {
        throw new Error(`Invalid environment configuration:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
    }

    return {
        nodeEnv: raw.NODE_ENV,
        isProduction,
        isTest,
        port: raw.PORT,
        logLevel: isTest && !source.LOG_LEVEL ? "silent" : raw.LOG_LEVEL,

        databaseUrl: databaseUrl!,
        databasePoolMax: Math.max(1, raw.DATABASE_POOL_MAX),

        jwtSecret: jwtSecret!,
        allowedOrigins,
        trustProxy: parseTrustProxy(raw.TRUST_PROXY),
        cookieSameSite: raw.COOKIE_SAMESITE,
        cookieDomain: raw.COOKIE_DOMAIN,

        deepgramApiKey: raw.DEEPGRAM_API_KEY,
        groqApiKey: raw.GROQ_API_KEY,
        groqModel: raw.GROQ_MODEL,
        groqEvalModel: raw.GROQ_EVAL_MODEL ?? raw.GROQ_MODEL,

        codeRunner: raw.CODE_RUNNER,
        runnerImage: raw.RUNNER_IMAGE,
        runnerConcurrency: Math.max(1, raw.RUNNER_CONCURRENCY),
        runnerMemoryMb: Math.max(64, raw.RUNNER_MEMORY_MB),
        runnerCpus: raw.RUNNER_CPUS,

        maxConcurrentInterviews: Math.max(1, raw.MAX_CONCURRENT_INTERVIEWS),
        maxInterviewsPerDay: raw.MAX_INTERVIEWS_PER_DAY,
        dataRetentionDays: raw.DATA_RETENTION_DAYS,
        reportWorkerEnabled: raw.REPORT_WORKER_ENABLED,

        webrtcPublicIp: raw.WEBRTC_PUBLIC_IP,
        webrtcPortRange: portMin && portMax ? [portMin, portMax] : undefined,
        stunUrls: raw.STUN_URLS ? raw.STUN_URLS.split(",").map((url) => url.trim()).filter(Boolean) : [],

        metricsToken: raw.METRICS_TOKEN,
    };
}

export const config: AppConfig = loadConfig();
