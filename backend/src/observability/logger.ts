import pino from "pino";
import { config } from "../config/env";

/**
 * Structured JSON logs. Credentials and tokens are redacted at the logger, so a stray
 * `log.info({ req })` can never leak them into log storage.
 */
export const logger = pino({
    level: config.logLevel,
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers['set-cookie']",
            "*.password",
            "*.accessToken",
            "*.refreshToken",
            "*.token",
        ],
        censor: "[redacted]",
    },
    ...(config.isProduction || config.isTest
        ? {}
        : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
});

export type Logger = typeof logger;
