import "../testing/setup";
import assert from "node:assert/strict";
import { Router } from "express";
import { after, before, describe, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { startServer, type TestServer } from "../testing/server";
import { createApp } from "./app";

/** A Prisma-shaped error, as thrown when a table is missing because migrations weren't applied. */
class FakePrismaError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
}

let server: TestServer;

before(async () => {
    const boom = () => {
        const router = Router();
        router.get("/boom/missing-table", () => { throw new FakePrismaError("P2021", "Invalid `prisma.refreshSession.create()` invocation in /srv/app/src/auth/sessions.ts:36:33 The table `public.RefreshSession` does not exist in the current database."); });
        router.get("/boom/unreachable", () => { throw new FakePrismaError("P1001", "Can't reach database server at `db.example.internal:5432`"); });
        router.get("/boom/bug", () => { throw new Error("secret internal detail: SELECT * FROM \"User\" WHERE password = 'x'"); });
        return router;
    };
    server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [boom] }));
});
after(async () => { await server.close(); await prisma.$disconnect(); });

async function get(path: string) {
    const res = await fetch(`${server.url}${path}`, { headers: { Origin: "http://localhost:3000" } });
    return { res, body: (await res.json()) as { msg: string; code: string; ref?: string } };
}

describe("errors never leak database or code details", () => {
    test("a missing table is a 503 with a plain message, not the query, file path or table name", async () => {
        const { res, body } = await get("/api/boom/missing-table");
        assert.equal(res.status, 503);
        assert.equal(body.code, "service_unavailable");
        assert.ok(res.headers.get("retry-after"));
        assert.doesNotMatch(JSON.stringify(body), /prisma|RefreshSession|sessions\.ts|public\./i);
    });

    test("an unreachable database is a 503 that doesn't reveal its address", async () => {
        const { res, body } = await get("/api/boom/unreachable");
        assert.equal(res.status, 503);
        assert.doesNotMatch(JSON.stringify(body), /example\.internal|5432/);
    });

    test("any other unexpected error is a 500 with a generic message and a reference id, even in development", async () => {
        const { res, body } = await get("/api/boom/bug");
        assert.equal(res.status, 500);
        assert.equal(body.code, "internal_error");
        assert.ok(body.ref, "a reference id lets support find the log line");
        assert.doesNotMatch(JSON.stringify(body), /secret internal detail|SELECT/);
    });
});

describe("readiness", () => {
    test("/readyz is ready when the database is migrated", async () => {
        const res = await fetch(`${server.url}/readyz`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { status: "ready" });
    });
});
