import "../../testing/setup";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { prisma } from "../../../lib/prisma";
import { resetDatabase } from "../../testing/db";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { createApp } from "../app";
import { accountRouter } from "./account";

const STRONG = "correct-horse-battery-9";
let server: TestServer;

before(async () => {
    server = await startServer(createApp({ rateLimitScale: 1000, apiRouters: [accountRouter] }));
});
after(async () => {
    await server.close();
    await prisma.$disconnect();
});
beforeEach(resetDatabase);

describe("DELETE /api/account", () => {
    test("needs the password, then removes the user, their sessions and their interviews", async () => {
        const client = new TestClient(server.url);
        const signup = await client.post("/api/auth/signup", { email: "gone@example.com", password: STRONG, name: "Gone" });
        client.accessToken = signup.body.accessToken;
        const userId = signup.body.user.id;
        await prisma.interview.create({ data: { userId, targetRole: "Backend Engineer", level: "mid", format: "standard", durationMinutes: 45 } });

        const wrong = await client.request("DELETE", "/api/account", { body: { password: "not-the-password" } });
        assert.equal(wrong.status, 403);
        assert.equal(await prisma.user.count(), 1);

        const noAuth = await client.request("DELETE", "/api/account", { body: { password: STRONG }, auth: false });
        assert.equal(noAuth.status, 401);

        const ok = await client.request("DELETE", "/api/account", { body: { password: STRONG } });
        assert.equal(ok.status, 200);
        assert.equal(await prisma.user.count(), 0);
        assert.equal(await prisma.refreshSession.count(), 0);
        assert.equal(await prisma.interview.count(), 0);
    });
});
