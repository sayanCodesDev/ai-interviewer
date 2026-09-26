import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type Request, type Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { prisma } from "../../lib/prisma";
import { config } from "../config/env";
import { logger } from "../observability/logger";
import { errorHandler, notFoundHandler, originGuard, requestId } from "./middleware";
import { createRateLimits, type RateLimits } from "./rateLimits";
import { authRouter } from "./routes/auth";

export interface AppOptions {
    /** Scales every rate limit; integration tests raise it so limits don't interfere. */
    rateLimitScale?: number;
    /** Routers mounted under /api after the shared middleware, each given the shared limiters. */
    apiRouters?: Array<(limits: RateLimits) => Router>;
}

export function createApp(options: AppOptions = {}): Express {
    const app = express();
    const limits = createRateLimits({ scale: options.rateLimitScale });

    app.set("trust proxy", config.trustProxy);
    app.disable("x-powered-by");

    app.use(requestId);
    app.use(
        pinoHttp({
            logger,
            genReqId: (req) => (req as Request & { id: string }).id,
            autoLogging: { ignore: (req) => req.url === "/healthz" || req.url === "/readyz" },
            customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
            serializers: {
                req: (req) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
                res: (res) => ({ statusCode: res.statusCode }),
            },
        }),
    );
    app.use(helmet());
    app.use(compression());
    app.use(
        cors({
            origin: config.allowedOrigins,
            credentials: true,
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
            exposedHeaders: ["X-Request-Id", "Retry-After"],
            maxAge: 600,
        }),
    );

    // Liveness and readiness sit before the body parsers and rate limits: orchestrators poll them constantly.
    app.get("/healthz", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.get("/readyz", async (_req, res) => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            res.json({ status: "ready" });
        } catch (error) {
            logger.error({ err: error }, "Readiness check failed");
            res.status(503).json({ status: "unavailable" });
        }
    });

    app.use(express.json({ limit: "256kb" }));
    app.use(cookieParser());
    app.use("/api", limits.global);
    app.use("/api", originGuard(config.allowedOrigins));

    app.use("/api/auth", authRouter(limits));
    for (const mount of options.apiRouters ?? []) app.use("/api", mount(limits));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
