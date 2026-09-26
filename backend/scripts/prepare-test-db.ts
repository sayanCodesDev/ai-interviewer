// Creates the local test database if needed and applies every migration to it.
// Refuses to run against anything but a local server, so `npm test` can never touch a real database.
import { execFileSync } from "node:child_process";
import pg from "pg";

const url = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5544/ai_interviewer_test");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    console.error(`Refusing to prepare a test database on non-local host "${url.hostname}".`);
    process.exit(1);
}

const dbName = url.pathname.slice(1);
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    console.error(`Unsafe test database name "${dbName}".`);
    process.exit(1);
}

const admin = new pg.Client({ connectionString: new URL("/postgres", url).toString() });
await admin.connect();
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();

execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url.toString() },
});
