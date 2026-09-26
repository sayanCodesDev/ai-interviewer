import "../../testing/setup";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";
import { config } from "../../config/env";
import { resetDatabase } from "../../testing/db";
import { startServer, TestClient, type TestServer } from "../../testing/server";
import { createApp } from "../app";
import { REFRESH_COOKIE } from "./auth";

const STRONG = "correct-horse-battery-9";

let server: TestServer;
// A generous scale so functional tests never trip the limiter; the limiter has its own suite below.
let scaledServer: TestServer;

before(async () => {
    server = await startServer(createApp({ rateLimitScale: 1000 }));
    scaledServer = await startServer(createApp({ rateLimitScale: 1 }));
});

after(async () => {
    await server.close();
    await scaledServer.close();
    await prisma.$disconnect();
});

beforeEach(resetDatabase);

async function signup(client: TestClient, email = "Ada@Example.com", password = STRONG) {
    const res = await client.post("/api/auth/signup", { email, password, name: "Ada Lovelace" });
    if (res.status === 201) client.accessToken = res.body.accessToken;
    return res;
}

describe("signup", () => {
    test("creates the user with a lower-cased email, an argon2id hash and a scoped httpOnly cookie", async () => {
        const client = new TestClient(server.url);
        const res = await signup(client);

        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, "ada@example.com");
        assert.equal(res.body.user.name, "Ada Lovelace");
        assert.ok(res.body.accessToken.split(".").length === 3);
        assert.equal(res.body.password, undefined);
        assert.equal(res.body.token, undefined);

        const stored = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
        assert.match(stored.password, /^\$argon2id\$/);

        const cookie = res.setCookies.find((line) => line.startsWith(`${REFRESH_COOKIE}=`));
        assert.ok(cookie, "refresh cookie set");
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /Path=\/api\/auth/);
        assert.match(cookie, /SameSite=Lax/i);
    });

    test("treats emails that differ only by case as the same account", async () => {
        const client = new TestClient(server.url);
        assert.equal((await signup(client, "a@example.com")).status, 201);
        const again = await signup(new TestClient(server.url), "A@EXAMPLE.COM");
        assert.equal(again.status, 409);
        assert.equal(again.body.code, "email_taken");
        assert.equal(await prisma.user.count(), 1);
    });

    test("rejects weak passwords and bad emails with a field message", async () => {
        const client = new TestClient(server.url);
        const short = await client.post("/api/auth/signup", { email: "a@example.com", password: "short" });
        assert.equal(short.status, 400);
        assert.match(short.body.fields.password, /at least 10/);

        const common = await client.post("/api/auth/signup", { email: "a@example.com", password: "password123" });
        assert.equal(common.status, 400);
        assert.match(common.body.fields.password, /too common/);

        const tooLong = await client.post("/api/auth/signup", { email: "a@example.com", password: "x".repeat(80) + "abc" });
        assert.equal(tooLong.status, 400);

        const badEmail = await client.post("/api/auth/signup", { email: "not-an-email", password: STRONG });
        assert.equal(badEmail.status, 400);
        assert.ok(badEmail.body.fields.email);
        assert.equal(await prisma.user.count(), 0);
    });
});

describe("signin", () => {
    test("accepts the right password and gives the same generic error for wrong password and unknown email", async () => {
        await signup(new TestClient(server.url));

        const good = await new TestClient(server.url).post("/api/auth/signin", { email: "ada@example.com", password: STRONG });
        assert.equal(good.status, 200);
        assert.ok(good.body.accessToken);

        const wrong = await new TestClient(server.url).post("/api/auth/signin", { email: "ada@example.com", password: "wrong-password-1" });
        const unknown = await new TestClient(server.url).post("/api/auth/signin", { email: "nobody@example.com", password: "wrong-password-1" });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.msg, unknown.body.msg);
        assert.equal(wrong.body.code, unknown.body.code);
    });

    test("upgrades a legacy bcrypt hash to argon2id on first sign-in", async () => {
        const legacy = await bcrypt.hash("old-style-password", 10);
        await prisma.user.create({ data: { email: "legacy@example.com", password: legacy, name: "Legacy" } });

        const res = await new TestClient(server.url).post("/api/auth/signin", { email: "Legacy@Example.com", password: "old-style-password" });
        assert.equal(res.status, 200);

        const stored = await prisma.user.findUniqueOrThrow({ where: { email: "legacy@example.com" } });
        assert.match(stored.password, /^\$argon2id\$/);

        const again = await new TestClient(server.url).post("/api/auth/signin", { email: "legacy@example.com", password: "old-style-password" });
        assert.equal(again.status, 200);
    });
});

describe("access tokens", () => {
    test("/me needs a bearer token; the refresh cookie alone does not authenticate", async () => {
        const client = new TestClient(server.url);
        await signup(client);

        assert.equal((await client.get("/api/auth/me")).status, 200);
        const cookieOnly = await client.get("/api/auth/me", { auth: false });
        assert.equal(cookieOnly.status, 401);
    });

    test("rejects expired, foreign-secret, wrong-algorithm and unsigned tokens", async () => {
        const client = new TestClient(server.url);
        const claims = { email: "ada@example.com", name: null };
        const base = { subject: "someone", issuer: "ai-interviewer", audience: "ai-interviewer-api" };

        const expired = jwt.sign(claims, config.jwtSecret, { ...base, expiresIn: -10 });
        const foreign = jwt.sign(claims, "a-different-secret-a-different-secret", { ...base, expiresIn: 60 });
        const wrongAudience = jwt.sign(claims, config.jwtSecret, { ...base, audience: "elsewhere", expiresIn: 60 });
        const hs512 = jwt.sign(claims, config.jwtSecret, { ...base, algorithm: "HS512", expiresIn: 60 });
        const unsigned = jwt.sign(claims, "", { ...base, algorithm: "none" as any, expiresIn: 60 });

        for (const [label, token] of Object.entries({ expired, foreign, wrongAudience, hs512, unsigned })) {
            const res = await client.get("/api/auth/me", { auth: token, sendCookies: false });
            assert.equal(res.status, 401, `${label} must be rejected`);
        }
    });
});

describe("refresh rotation", () => {
    test("rotates the cookie and returns a working access token", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        const first = client.getCookie(REFRESH_COOKIE)!;

        const res = await client.post("/api/auth/refresh");
        assert.equal(res.status, 200);
        assert.ok(res.body.accessToken);
        const second = client.getCookie(REFRESH_COOKIE)!;
        assert.notEqual(first, second);

        assert.equal((await client.get("/api/auth/me", { auth: res.body.accessToken })).status, 200);
    });

    test("replaying an already-rotated token revokes the whole family", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        const stolen = client.getCookie(REFRESH_COOKIE)!;
        await client.post("/api/auth/refresh");
        const current = client.getCookie(REFRESH_COOKIE)!;

        // Move the rotation outside the grace window, as if the replay happened later.
        await prisma.refreshSession.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });

        const attacker = new TestClient(server.url);
        attacker.setCookie(REFRESH_COOKIE, stolen);
        const replay = await attacker.post("/api/auth/refresh");
        assert.equal(replay.status, 401);
        assert.equal(replay.body.code, "session_reused");

        // The legitimate holder's newer token died with the family.
        const victim = new TestClient(server.url);
        victim.setCookie(REFRESH_COOKIE, current);
        assert.equal((await victim.post("/api/auth/refresh")).status, 401);
    });

    test("two tabs refreshing at once are both served (grace window)", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        const shared = client.getCookie(REFRESH_COOKIE)!;

        const tabA = new TestClient(server.url);
        const tabB = new TestClient(server.url);
        tabA.setCookie(REFRESH_COOKIE, shared);
        tabB.setCookie(REFRESH_COOKIE, shared);
        const [a, b] = await Promise.all([tabA.post("/api/auth/refresh"), tabB.post("/api/auth/refresh")]);
        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
    });

    test("an expired refresh token is refused", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        await prisma.refreshSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
        const res = await client.post("/api/auth/refresh");
        assert.equal(res.status, 401);
        assert.equal(res.body.code, "session_expired");
    });

    test("stores only a hash of the token", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        const raw = client.getCookie(REFRESH_COOKIE)!;
        const rows = await prisma.refreshSession.findMany();
        assert.equal(rows.length, 1);
        assert.notEqual(rows[0]!.tokenHash, raw);
        assert.match(rows[0]!.tokenHash, /^[0-9a-f]{64}$/);
    });

    test("without a cookie there is no session", async () => {
        const res = await new TestClient(server.url).post("/api/auth/refresh");
        assert.equal(res.status, 401);
        assert.equal(res.body.code, "no_session");
    });
});

describe("logout", () => {
    test("revokes the refresh token so it cannot be used again", async () => {
        const client = new TestClient(server.url);
        await signup(client);
        const cookie = client.getCookie(REFRESH_COOKIE)!;

        assert.equal((await client.post("/api/auth/logout")).status, 200);

        const replay = new TestClient(server.url);
        replay.setCookie(REFRESH_COOKIE, cookie);
        assert.equal((await replay.post("/api/auth/refresh")).status, 401);
    });

    test("logout-all revokes every device", async () => {
        const phone = new TestClient(server.url);
        await signup(phone);
        const laptop = new TestClient(server.url);
        await laptop.post("/api/auth/signin", { email: "ada@example.com", password: STRONG });

        assert.equal((await phone.post("/api/auth/logout-all")).status, 200);
        assert.equal((await laptop.post("/api/auth/refresh")).status, 401);
    });
});

describe("request hardening", () => {
    test("refuses state-changing requests from an origin that is not allowed", async () => {
        const client = new TestClient(server.url, "https://evil.example");
        const res = await client.post("/api/auth/signin", { email: "a@example.com", password: "whatever-1234" });
        assert.equal(res.status, 403);
        assert.equal(res.body.code, "origin_forbidden");
    });

    test("malformed and oversized bodies get a generic 4xx, not a stack trace", async () => {
        const client = new TestClient(server.url);
        const malformed = await client.request("POST", "/api/auth/signin", { rawBody: "{not json" });
        assert.equal(malformed.status, 400);
        assert.ok(!JSON.stringify(malformed.body).includes("SyntaxError"));

        const big = await client.request("POST", "/api/auth/signin", { rawBody: JSON.stringify({ email: "a@b.co", password: "x".repeat(300_000) }) });
        assert.equal(big.status, 413);
    });

    test("sets security headers, echoes a request id and hides the framework", async () => {
        const res = await new TestClient(server.url).get("/healthz");
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("x-powered-by"), null);
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.ok(res.headers.get("x-request-id"));
        assert.ok(res.headers.get("content-security-policy"));
    });

    test("readiness reflects the database", async () => {
        const res = await new TestClient(server.url).get("/readyz");
        assert.equal(res.status, 200);
        assert.equal(res.body.status, "ready");
    });

    test("unknown routes are a JSON 404", async () => {
        const res = await new TestClient(server.url).get("/api/nope");
        assert.equal(res.status, 404);
        assert.equal(res.body.code, "not_found");
    });
});

describe("rate limiting", () => {
    test("locks out repeated failed sign-ins for one address + email, but not other accounts", async () => {
        const target = { email: "victim@example.com", password: "guess-number-1" };
        const client = new TestClient(scaledServer.url);
        const statuses: number[] = [];
        for (let i = 0; i < 10; i++) statuses.push((await client.post("/api/auth/signin", target)).status);

        assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
        assert.deepEqual(statuses.slice(8), [429, 429]);

        const other = await client.post("/api/auth/signin", { email: "someone-else@example.com", password: "guess-number-1" });
        assert.equal(other.status, 401);
    });

    test("caps sign-ups per address", async () => {
        const client = new TestClient(scaledServer.url);
        const statuses: number[] = [];
        for (let i = 0; i < 10; i++) statuses.push((await client.post("/api/auth/signup", { email: `bot${i}@example.com`, password: STRONG })).status);
        assert.equal(statuses.filter((status) => status === 201).length, 8);
        assert.equal(statuses.filter((status) => status === 429).length, 2);
    });
});
