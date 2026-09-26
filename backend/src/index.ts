import { config } from "./config/env";
import { checkSchema, schemaHelp } from "./db/schema";
import { startMaintenance, stopMaintenance } from "./maintenance";
import { createApp } from "./http/app";
import { accountRouter } from "./http/routes/account";
import { interviewsRouter } from "./http/routes/interviews";
import { webrtcRouter } from "./http/routes/webrtc";
import { verifyModels } from "./llm/client";
import { logger } from "./observability/logger";
import { drainLive } from "./webrtc/registry";
import { describeRunner } from "./runner";
import { startReportWorker, stopReportWorker } from "./scoring/worker";

// Refuse to run against a database that is missing migrations. Otherwise the first sign-in fails with
// "The table public.RefreshSession does not exist" instead of telling anyone what to do.
try {
    const schema = await checkSchema();
    if (schema.skipped) logger.warn("Migration files are not deployed with the server, so the database schema could not be checked");
    else if (!schema.ok) {
        logger.fatal({ missing: schema.missing }, schemaHelp(schema.missing));
        process.exit(1);
    }
} catch (error) {
    logger.fatal({ err: error }, "Could not reach the database. Check DATABASE_URL and that the database is running.");
    process.exit(1);
}

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

startReportWorker();

// Housekeeping: expired sessions, orphaned interviews, data past its retention period.
startMaintenance();

let shuttingDown = false;
async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down: no new calls, letting live interviews finish");
    // New HTTP requests are refused by closing the listener; running calls (WebRTC) keep going for a while.
    server.close();
    stopReportWorker();
    stopMaintenance();
    await drainLive(Number(process.env.SHUTDOWN_GRACE_MS) || 60_000);
    process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
