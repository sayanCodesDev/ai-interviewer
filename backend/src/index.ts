import { config } from "./config/env";
import { purgeExpiredSessions } from "./auth/sessions";
import { createApp } from "./http/app";
import { accountRouter } from "./http/routes/account";
import { interviewsRouter } from "./http/routes/interviews";
import { webrtcRouter } from "./http/routes/webrtc";
import { verifyModels } from "./llm/client";
import { logger } from "./observability/logger";
import { drainLive } from "./webrtc/registry";
import { describeRunner } from "./runner";

const app = createApp({ apiRouters: [accountRouter, interviewsRouter, webrtcRouter] });

const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "Server started");
    // Surface a bad model name or a missing sandbox now, not as a silent interviewer mid-call.
    void verifyModels();
    void describeRunner().then((runner) => {
        if (runner.ok) logger.info({ runner: runner.kind }, "Code runner ready");
        else logger.error({ runner: runner.kind, reason: runner.reason }, "Code runner unavailable: running code will fail");
    });
});

// Expired refresh tokens can never be used again; sweep them out once a day.
const sweep = setInterval(() => {
    purgeExpiredSessions().catch((err) => logger.warn({ err }, "Could not purge expired sessions"));
}, 24 * 60 * 60 * 1000);
sweep.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down: no new calls, letting live interviews finish");
    // New HTTP requests are refused by closing the listener; running calls (WebRTC) keep going for a while.
    server.close();
    await drainLive(Number(process.env.SHUTDOWN_GRACE_MS) || 60_000);
    process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
