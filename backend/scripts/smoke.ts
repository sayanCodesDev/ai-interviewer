// A quick end-to-end check of the API and its database, for after a deploy or a database change:
//
//   BASE_URL=http://127.0.0.1:2000 npx tsx scripts/smoke.ts
//   BASE_URL=https://api.example.com ORIGIN=https://app.example.com ALLOW_REMOTE=1 npx tsx scripts/smoke.ts
//
// It signs up a throwaway account, signs in, refreshes the session, creates and reads an interview, deletes the
// interview, then deletes the account, so it leaves nothing behind. It needs no language model, speech or Docker.
// Every step that touches the database (users, refresh sessions, interviews) is one that fails loudly if a migration
// is missing. Exit code 0 means everything worked.
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:2000";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE !== "1") {
    console.error(`${host} is not a local address. Set ALLOW_REMOTE=1 to run the smoke test against a server you own.`);
    process.exit(1);
}

// Interviews need a job description and a real GitHub account. octocat is GitHub's own demo account.
const GITHUB = process.env.SMOKE_GITHUB ?? "octocat";
const JOB_DESCRIPTION = "Backend engineer for a payments platform. Build Go services on PostgreSQL and Kafka, own their reliability and mentor the team.";

const email = `smoke-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
const password = `smoke-${crypto.randomBytes(9).toString("base64url")}`;
let cookie = "";
let token = "";
let accountCreated = false;

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
    try {
        const result = await run();
        console.log(`  ok    ${name}`);
        return result;
    } catch (error) {
        console.log(`  FAIL  ${name}: ${(error as Error).message}`);
        throw error;
    }
}

async function api(method: string, path: string, body?: unknown, options: { auth?: boolean; withCookie?: boolean } = {}) {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;
    if (options.withCookie && cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("aii_rt="));
    if (setCookie) cookie = setCookie.split(";")[0]!;
    return { status: res.status, json, text };
}

const expect = (res: { status: number; text: string }, ...statuses: number[]) => {
    if (!statuses.includes(res.status)) throw new Error(`expected ${statuses.join("/")}, got ${res.status}: ${res.text.slice(0, 200)}`);
};

console.log(`Smoke test against ${BASE}`);
let failed = false;
try {
    await step("the server is ready (database reachable, migrations applied)", async () => {
        const res = await fetch(BASE + "/readyz");
        if (!res.ok) throw new Error(`/readyz answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    });
    await step("the interview options load", async () => {
        const res = await api("GET", "/api/interview-options", undefined, { auth: false });
        expect(res, 200);
        if (!res.json?.roles?.length) throw new Error("no roles returned");
    });
    await step("sign up (writes a user and a refresh session)", async () => {
        const res = await api("POST", "/api/auth/signup", { email, password, name: "Smoke Test" }, { auth: false });
        expect(res, 200, 201);
        token = res.json.accessToken;
        accountCreated = true;
        if (!cookie) throw new Error("no refresh cookie was set");
    });
    await step("the access token identifies the account", async () => {
        const res = await api("GET", "/api/auth/me");
        expect(res, 200);
        if (res.json?.user?.email !== email) throw new Error("wrong account");
    });
    await step("refresh rotates the session", async () => {
        const before = cookie;
        const res = await api("POST", "/api/auth/refresh", undefined, { auth: false, withCookie: true });
        expect(res, 200);
        token = res.json.accessToken;
        if (cookie === before) throw new Error("the refresh token did not rotate");
    });
    await step("sign in with the password", async () => {
        const res = await api("POST", "/api/auth/signin", { email, password }, { auth: false });
        expect(res, 200);
        token = res.json.accessToken;
    });
    const id = await step("create an interview (writes an interview row)", async () => {
        const res = await api("POST", "/api/interviews", { role: "Backend Engineer", level: "mid", format: "quick", jobDescription: JOB_DESCRIPTION, githubUrl: GITHUB });
        expect(res, 201);
        return res.json.id as string;
    });
    await step("read it back", async () => {
        const res = await api("GET", `/api/interviews/${id}`);
        expect(res, 200);
    });
    await step("list interviews", async () => {
        const res = await api("GET", "/api/interviews");
        expect(res, 200);
        if (!JSON.stringify(res.json).includes(id)) throw new Error("the new interview is not in the list");
    });
    await step("delete the interview", async () => {
        expect(await api("DELETE", `/api/interviews/${id}`), 200, 204);
    });
} catch {
    failed = true;
} finally {
    if (accountCreated) {
        try {
            const res = await api("DELETE", "/api/account", { password });
            if (res.status === 200 || res.status === 204) console.log("  ok    the throwaway account was deleted");
            else { console.log(`  FAIL  could not delete the throwaway account ${email}: ${res.status} ${res.text.slice(0, 120)}`); failed = true; }
        } catch (error) {
            console.log(`  FAIL  could not delete the throwaway account ${email}: ${(error as Error).message}`);
            failed = true;
        }
    }
}
console.log(failed ? "\nSmoke test FAILED." : "\nSmoke test passed.");
process.exit(failed ? 1 : 0);
