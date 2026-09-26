import { config } from "./config/env";
import { createApp } from "./http/app";
import { accountRouter } from "./http/routes/account";
import { legacyRouter } from "./http/routes/legacy";
import { logger } from "./observability/logger";
import { verifyModelAvailable } from "./services/llm";
import webrtcRouter from "./serverWebrtc";
import { purgeExpiredSessions } from "./auth/sessions";

const app = createApp({
    apiRouters: [accountRouter, legacyRouter, (limits) => {
        webrtcRouter.use(limits.webrtc);
        return webrtcRouter;
    }],
});

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "Server started");
    // Surface a bad GROQ_MODEL now rather than as a silent interviewer mid-call.
    void verifyModelAvailable();
});

// Expired refresh tokens can never be used again; sweep them out once a day.
const sweep = setInterval(() => {
    purgeExpiredSessions().catch((err) => logger.warn({ err }, "Could not purge expired sessions"));
}, 24 * 60 * 60 * 1000);
sweep.unref();

function shutdown(signal: string) {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
