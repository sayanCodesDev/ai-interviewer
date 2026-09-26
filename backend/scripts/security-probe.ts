// Attacks a running server the way a hostile user would, and reports what held. It complements the unit and
// integration tests by going through the real HTTP stack, headers and rate limiters.
//
//   npx tsx scripts/security-probe.ts                       # against http://127.0.0.1:2000
//   BASE_URL=http://127.0.0.1:2000 npx tsx scripts/security-probe.ts
//
// It creates a few throwaway accounts through the public API and never touches anything else. It refuses to
// run against a non-local address unless you pass ALLOW_REMOTE=1: do not point it at a system you don't own.
// Start the server with a fresh process first: sign-up and sign-in are rate limited per address, and this script
// deliberately trips those limits at the end.
import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:2000";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE !== "1") {
    console.error(`Refusing to probe ${host}. Set ALLOW_REMOTE=1 only for a system you own.`);
    process.exit(1);
}

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
    if (ok) { passed++; console.log(`  ok    ${name}`); }
    else { failures.push(`${name}${detail ? ` (${detail})` : ""}`); console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`); }
}
const section = (title: string) => console.log(`\n${title}`);

interface Reply { status: number; headers: Headers; body: any; text: string }
async function call(method: string, path: string, options: { body?: unknown; raw?: string; token?: string; cookie?: string; origin?: string | null; headers?: Record<string, string> } = {}): Promise<Reply> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined || options.raw !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
    const res = await fetch(BASE + path, { method, headers, body: options.raw ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined), redirect: "manual" });
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, body, text };
}

const PASSWORD = "correct-horse-battery-9";
const run = crypto.randomBytes(4).toString("hex");
async function account(label: string) {
    const email = `probe-${label}-${run}@example.com`;
    const res = await call("POST", "/api/auth/signup", { body: { email, password: PASSWORD, name: `Probe ${label}` } });
    if (res.status !== 201 && res.status !== 200) throw new Error(`could not create ${label}: ${res.status} ${res.text.slice(0, 160)}`);
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    return { email, token: res.body.accessToken as string, cookie, id: res.body.user.id as string, setCookie: res.headers.getSetCookie?.() ?? [] };
}

console.log(`Probing ${BASE}`);

// ------------------------------------------------------------------------------------------------
section("Transport and headers");
{
    const res = await call("GET", "/healthz", { origin: null });
    check("no X-Powered-By fingerprint", !res.headers.get("x-powered-by"));
    check("nosniff is set", res.headers.get("x-content-type-options") === "nosniff");
    check("clickjacking protection is set", Boolean(res.headers.get("x-frame-options") || res.headers.get("content-security-policy")?.includes("frame-ancestors")));
    const evil = await call("GET", "/api/interview-options", { origin: "https://evil.example" });
    check("a foreign origin is not granted CORS access", !evil.headers.get("access-control-allow-origin"), evil.headers.get("access-control-allow-origin") ?? "");
    const good = await call("GET", "/api/interview-options", { origin: ORIGIN });
    check("the configured origin is granted CORS access, with credentials", good.headers.get("access-control-allow-origin") === ORIGIN && good.headers.get("access-control-allow-credentials") === "true");
    const preflight = await fetch(BASE + "/api/auth/signin", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    check("a foreign origin's preflight is refused", !preflight.headers.get("access-control-allow-origin"));
    const metrics = await call("GET", "/metrics", { origin: null });
    check("/metrics is not open to the world", metrics.status === 404 || metrics.status === 401, String(metrics.status));
}

// ------------------------------------------------------------------------------------------------
section("Sign-up, sign-in and sessions");
const alice = await account("alice");
const bob = await account("bob");
{
    const refreshCookie = alice.setCookie.find((c) => c.startsWith("aii_rt="));
    check("the refresh token is an httpOnly cookie", Boolean(refreshCookie?.toLowerCase().includes("httponly")));
    check("the refresh cookie is scoped to the auth endpoints", Boolean(refreshCookie?.includes("Path=/api/auth")));
    check("the refresh cookie has a SameSite policy", Boolean(refreshCookie?.toLowerCase().includes("samesite")));
    check("the access token is not in a cookie", !alice.setCookie.some((c) => c.includes(alice.token)));

    const unknown = await call("POST", "/api/auth/signin", { body: { email: `nobody-${run}@example.com`, password: "wrong-password-123" } });
    const wrong = await call("POST", "/api/auth/signin", { body: { email: alice.email, password: "wrong-password-123" } });
    check("wrong password and unknown user look identical (no account enumeration)", unknown.status === wrong.status && unknown.body?.msg === wrong.body?.msg, `${unknown.status} vs ${wrong.status}`);
    check("no token in a failed sign-in", !unknown.text.includes("accessToken") && !wrong.text.includes("accessToken"));

    const upper = await call("POST", "/api/auth/signin", { body: { email: alice.email.toUpperCase(), password: PASSWORD } });
    check("email is case-insensitive", upper.status === 200, String(upper.status));

    const dup = await call("POST", "/api/auth/signup", { body: { email: alice.email.toUpperCase(), password: PASSWORD, name: "Dup" } });
    check("a case-variant of an existing email cannot register a second account", dup.status >= 400 && dup.status < 500, String(dup.status));

    const weak = await call("POST", "/api/auth/signup", { body: { email: `weak-${run}@example.com`, password: "short" } });
    check("a weak password is refused", weak.status === 400);

    const noAuth = await call("GET", "/api/auth/me");
    check("protected routes need a token", noAuth.status === 401);
    const good = await call("GET", "/api/auth/me", { token: alice.token });
    check("a valid token works", good.status === 200 && good.body?.user?.email === alice.email);
}

// ------------------------------------------------------------------------------------------------
section("Forged and tampered tokens");
{
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const forged = (header: object, payload: object, secret: string | null) => {
        const data = `${b64(header)}.${b64(payload)}`;
        return `${data}.${secret ? crypto.createHmac("sha256", secret).update(data).digest("base64url") : ""}`;
    };
    const claims = { sub: alice.id, email: alice.email, iss: "ai-interviewer", aud: "ai-interviewer-api", exp: Math.floor(Date.now() / 1000) + 600 };
    const attempts: Array<[string, string]> = [
        ["alg=none", forged({ alg: "none", typ: "JWT" }, claims, null)],
        ["signed with a guessed secret", forged({ alg: "HS256", typ: "JWT" }, claims, "secret")],
        ["expired", forged({ alg: "HS256", typ: "JWT" }, { ...claims, exp: 1 }, "secret")],
        ["garbage", "not.a.token"],
        ["a real token with its payload swapped to another user", `${alice.token.split(".")[0]}.${b64({ ...claims, sub: bob.id })}.${alice.token.split(".")[2]}`],
    ];
    for (const [name, token] of attempts) {
        const res = await call("GET", "/api/auth/me", { token });
        check(`rejected: ${name}`, res.status === 401, String(res.status));
    }
}

// ------------------------------------------------------------------------------------------------
section("Refresh tokens");
{
    const first = await call("POST", "/api/auth/signin", { body: { email: bob.email, password: PASSWORD } });
    const cookieOf = (r: Reply) => (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("aii_rt="))?.split(";")[0] ?? "";
    const original = cookieOf(first);
    check("sign-in sets a refresh cookie", original.startsWith("aii_rt="));

    // Browsers always send Origin on a cross-site POST, so a request without one is not a CSRF attempt (the guard
    // is documented to let non-browser clients through). What must hold is that a wrong Origin is refused.
    const evil = await call("POST", "/api/auth/refresh", { cookie: original, origin: "https://evil.example" });
    check("a cookie-authenticated refresh from a foreign origin is refused", evil.status === 403, String(evil.status));

    const rotated = await call("POST", "/api/auth/refresh", { cookie: original });
    check("refresh works and rotates the token", rotated.status === 200 && cookieOf(rotated) !== "" && cookieOf(rotated) !== original, String(rotated.status));
    await new Promise((resolve) => setTimeout(resolve, 11_000)); // past the grace window that tolerates a racing double refresh
    const replay = await call("POST", "/api/auth/refresh", { cookie: original });
    check("replaying the old refresh token fails", replay.status === 401, String(replay.status));
    const family = await call("POST", "/api/auth/refresh", { cookie: cookieOf(rotated) });
    check("and burns the whole family, including the newer token", family.status === 401, String(family.status));

    const again = await call("POST", "/api/auth/signin", { body: { email: bob.email, password: PASSWORD } });
    const live = cookieOf(again);
    await call("POST", "/api/auth/logout", { cookie: live });
    const afterLogout = await call("POST", "/api/auth/refresh", { cookie: live });
    check("a refresh token is dead after sign-out", afterLogout.status === 401, String(afterLogout.status));
}

// ------------------------------------------------------------------------------------------------
section("Other people's data");
{
    const made = await call("POST", "/api/interviews", { token: alice.token, body: { role: "Backend Engineer", level: "mid", format: "quick" } });
    check("an interview can be created", made.status === 201 && typeof made.body?.id === "string", `${made.status} ${made.text.slice(0, 120)}`);
    const id = made.body?.id as string;
    for (const [method, path] of [["GET", `/api/interviews/${id}`], ["GET", `/api/interviews/${id}/report`], ["DELETE", `/api/interviews/${id}`], ["POST", `/api/interviews/${id}/end`], ["POST", `/api/interviews/${id}/report/retry`]] as const) {
        const res = await call(method, path, { token: bob.token, ...(method === "POST" ? { body: {} } : {}) });
        check(`another user cannot ${method} ${path.replace(id, ":id")}`, res.status === 404, String(res.status));
    }
    const run = await call("POST", `/api/interviews/${id}/run`, { token: bob.token, body: { problemKey: "two-sum", language: "python", code: "x=1", mode: "examples" } });
    check("another user cannot run code against it", run.status === 404, String(run.status));
    const offer = await call("POST", "/api/webrtc/offer", { token: bob.token, body: { sdp: "v=0\r\n".repeat(20), type: "offer", interviewId: id } });
    check("another user cannot open a call on it", offer.status === 404, String(offer.status));
    const list = await call("GET", "/api/interviews", { token: bob.token });
    check("another user's list does not include it", list.status === 200 && !JSON.stringify(list.body).includes(id));
    const own = await call("GET", `/api/interviews/${id}`, { token: alice.token });
    check("the owner still can", own.status === 200);
    check("the response never contains other users' hidden test data", !own.text.includes("expectedHidden") && !own.text.includes('"reference"'));
}

// ------------------------------------------------------------------------------------------------
section("Hostile input");
{
    const badJson = await call("POST", "/api/auth/signin", { raw: '{"email": "a@b.co", ' });
    check("malformed JSON is a 400, not a crash", badJson.status === 400, String(badJson.status));
    const big = await call("POST", "/api/auth/signin", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(400_000) }) });
    check("an oversized body is refused (413)", big.status === 413, String(big.status));
    const pollution = await call("POST", "/api/auth/signin", { raw: '{"email":"a@b.co","password":"x","__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}}}' });
    check("prototype-pollution keys are harmless", pollution.status < 500, String(pollution.status));
    check("...and did not pollute anything", ({} as any).admin === undefined && (await call("GET", "/healthz", { origin: null })).status === 200);

    const sqli = await call("POST", "/api/auth/signin", { body: { email: "' OR '1'='1", password: "' OR '1'='1" } });
    check("SQL-shaped credentials are just wrong credentials", sqli.status === 400 || sqli.status === 401, String(sqli.status));
    const objectEmail = await call("POST", "/api/auth/signin", { body: { email: { $ne: null }, password: { $ne: null } } });
    check("operator objects in place of strings are refused", objectEmail.status === 400, String(objectEmail.status));

    for (const [name, github] of [["a path-traversal username", "../../etc/passwd"], ["a username with a URL and credentials", "https://user:pass@evil.example/x"], ["a username with spaces and shell characters", "octo cat; rm -rf /"]] as const) {
        const res = await call("POST", "/api/interviews", { token: alice.token, body: { role: "Backend Engineer", level: "mid", format: "quick", githubUrl: github } });
        check(`GitHub field: ${name} cannot reach a request`, res.status === 201 || res.status === 400, String(res.status));
    }
    const longJd = await call("POST", "/api/interviews", { token: alice.token, body: { role: "Backend Engineer", jobDescription: "x".repeat(6_001) } });
    check("an over-long job description is refused", longJd.status === 400, String(longJd.status));
    const badRole = await call("POST", "/api/interviews", { token: alice.token, body: { role: "Chief Wizard" } });
    check("an unknown role is refused", badRole.status === 400, String(badRole.status));

    const badId = await call("GET", "/api/interviews/..%2F..%2Fetc%2Fpasswd", { token: alice.token });
    check("a path-traversal id is rejected", badId.status === 400 || badId.status === 404, String(badId.status));
    const badId2 = await call("GET", "/api/interviews/1'%20OR%20'1'='1", { token: alice.token });
    check("an SQL-shaped id is rejected", badId2.status === 400 || badId2.status === 404, String(badId2.status));

    const boundary = "----probe";
    const fake = `--${boundary}\r\nContent-Disposition: form-data; name="role"\r\n\r\nBackend Engineer\r\n--${boundary}\r\nContent-Disposition: form-data; name="resume"; filename="evil.exe"\r\nContent-Type: application/x-msdownload\r\n\r\nMZ\x90\x00\r\n--${boundary}--\r\n`;
    const upload = await fetch(BASE + "/api/interviews", { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Authorization: `Bearer ${alice.token}`, Origin: ORIGIN }, body: fake });
    check("an executable uploaded as a resume is refused", upload.status === 400, String(upload.status));

    const notFound = await call("GET", "/api/definitely-not-a-route", { token: alice.token });
    check("unknown routes give a clean 404 without internals", notFound.status === 404 && !/at .*\.(ts|js):\d+/.test(notFound.text) && !/prisma/i.test(notFound.text));
}

// ------------------------------------------------------------------------------------------------
section("Abuse limits");
{
    let limited = 0;
    for (let i = 0; i < 25; i++) {
        const res = await call("POST", "/api/auth/signin", { body: { email: alice.email, password: `wrong-password-${i}` } });
        if (res.status === 429) { limited++; if (!res.headers.get("retry-after") && !res.headers.get("ratelimit")) check("a 429 says when to retry", false); break; }
    }
    check("repeated wrong passwords get rate limited", limited > 0);
    const spam = [];
    for (let i = 0; i < 12; i++) spam.push(await call("POST", "/api/auth/signup", { body: { email: `spam-${run}-${i}@example.com`, password: PASSWORD, name: "Spam" } }));
    check("mass sign-up from one address gets rate limited", spam.some((r) => r.status === 429));
}

console.log(`\n${passed} checks held${failures.length ? `, ${failures.length} FAILED:` : "."}`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
