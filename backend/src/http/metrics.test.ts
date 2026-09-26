import "../testing/setup";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { config } from "../config/env";
import { startServer, type TestServer } from "../testing/server";
import { createApp } from "./app";

let server: TestServer;
const original = config.metricsToken;
before(async () => { server = await startServer(createApp({ rateLimitScale: 1000 })); });
after(async () => { await server.close(); await prisma.$disconnect(); });
afterEach(() => { config.metricsToken = original; });

describe("/metrics", () => {
    test("does not exist unless a token is configured", async () => {
        config.metricsToken = undefined;
        assert.equal((await fetch(`${server.url}/metrics`)).status, 404);
        assert.equal((await fetch(`${server.url}/metrics`, { headers: { Authorization: "Bearer anything" } })).status, 404);
    });

    test("refuses a missing or wrong token and serves Prometheus text for the right one", async () => {
        config.metricsToken = "s3cret-metrics-token";
        assert.equal((await fetch(`${server.url}/metrics`)).status, 401);
        assert.equal((await fetch(`${server.url}/metrics`, { headers: { Authorization: "Bearer nope" } })).status, 401);
        assert.equal((await fetch(`${server.url}/metrics`, { headers: { Authorization: "s3cret-metrics-token" } })).status, 401, "must be a Bearer token");

        const ok = await fetch(`${server.url}/metrics`, { headers: { Authorization: "Bearer s3cret-metrics-token" } });
        assert.equal(ok.status, 200);
        assert.match(ok.headers.get("content-type") ?? "", /text\/plain/);
        const text = await ok.text();
        assert.match(text, /ai_interviewer_active_interviews/);
        assert.match(text, /process_cpu_seconds_total/);
    });
});
