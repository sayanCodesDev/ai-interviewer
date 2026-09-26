// Executes one job inside the sandbox container (or, for local development, directly on the host).
//
// Protocol: a single JSON object on stdin, a single JSON object on stdout.
//   in : { language, files: {name: content}, stdin, compileTimeoutMs, runTimeoutMs, maxOutputBytes }
//   out: { compile: { ok, output }, run: { exitCode, signal, timedOut, stdout, stderr, truncated, ms } | null }
//
// This file deliberately has no dependencies and knows nothing about problems or tests: it only
// compiles and runs what it is given. Isolation (no network, memory/CPU/pid limits, read-only
// filesystem, non-root) comes from the container the host starts it in.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 256 * 1024;

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}

/** Runs a command, feeding it `input`, and never lets output or time grow without bound. */
function execute(command, args, { cwd, input, timeoutMs, maxOutputBytes, env }) {
    return new Promise((resolve) => {
        const started = process.hrtime.bigint();
        const child = spawn(command, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });

        let stdout = "";
        let stderr = "";
        let bytes = 0;
        let truncated = false;
        let timedOut = false;
        let spawnError = null;

        const collect = (which) => (chunk) => {
            if (truncated) return;
            const room = maxOutputBytes - bytes;
            const text = chunk.toString("utf8");
            const take = Buffer.byteLength(text) > room ? text.slice(0, Math.max(0, room)) : text;
            bytes += Buffer.byteLength(take);
            if (which === "out") stdout += take;
            else stderr += take;
            if (take.length < text.length || bytes >= maxOutputBytes) {
                truncated = true;
                killGroup();
            }
        };

        const killGroup = () => {
            try {
                process.kill(-child.pid, "SIGKILL");
            } catch {
                try { child.kill("SIGKILL"); } catch { /* already gone */ }
            }
        };

        const timer = setTimeout(() => {
            timedOut = true;
            killGroup();
        }, timeoutMs);

        child.stdout.on("data", collect("out"));
        child.stderr.on("data", collect("err"));
        child.on("error", (error) => {
            spawnError = error;
        });
        child.stdin.on("error", () => { /* the program may exit before reading its input */ });
        child.stdin.end(input ?? "");

        child.on("close", (exitCode, signal) => {
            clearTimeout(timer);
            killGroup(); // reap anything the program left running
            resolve({
                exitCode,
                signal,
                timedOut,
                stdout,
                stderr,
                truncated,
                spawnError: spawnError ? String(spawnError.code ?? spawnError.message) : null,
                ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
            });
        });
    });
}

// Compilers without GCC's <bits/stdc++.h> (macOS clang) get a stand-in header. Linux images have the real one.
function cppExtraFlags() {
    const compat = fileURLToPath(new URL("./compat", import.meta.url));
    return process.platform === "darwin" && existsSync(compat) ? ["-I", compat] : [];
}

const COMMANDS = {
    javascript: { file: "main.mjs", run: ["node", ["main.mjs"]] },
    typescript: { file: "main.ts", run: ["node", ["--experimental-strip-types", "--no-warnings", "main.ts"]] },
    python: { run: ["python3", ["-u", "main.py"]] },
    cpp: { compile: ["g++", ["-std=c++17", "-O1", "-pipe", ...cppExtraFlags(), "-o", "main", "main.cpp"]], run: ["./main", []] },
    java: { compile: ["javac", ["-encoding", "UTF-8", "-d", ".", "Solution.java", "Main.java"]], run: ["java", ["-Xmx192m", "-Xss16m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-cp", ".", "Main"]] },
};

async function main() {
    let job;
    try {
        job = JSON.parse(await readStdin());
    } catch {
        return { error: "Malformed job.", compile: null, run: null };
    }

    const spec = COMMANDS[job.language];
    if (!spec) return { error: `Unsupported language: ${job.language}`, compile: null, run: null };

    const files = Object.entries(job.files ?? {});
    if (files.length === 0 || files.length > MAX_FILES) return { error: "Bad file set.", compile: null, run: null };
    for (const [name, content] of files) {
        if (!/^[A-Za-z0-9_.-]+$/.test(name) || typeof content !== "string" || Buffer.byteLength(content) > MAX_FILE_BYTES) {
            return { error: "Bad file.", compile: null, run: null };
        }
    }

    const dir = await mkdtemp(path.join(process.env.RUNNER_TMP || tmpdir(), "job-"));
    // Submitted code inherits none of the host's environment, and nothing from ours either.
    const env = { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: dir, TMPDIR: dir, LANG: "C.UTF-8" };
    const maxOutputBytes = Math.min(Number(job.maxOutputBytes) || 262144, 8 * 1024 * 1024);

    try {
        for (const [name, content] of files) await writeFile(path.join(dir, name), content, "utf8");

        let compile = { ok: true, output: "" };
        if (spec.compile) {
            const [command, args] = spec.compile;
            const result = await execute(command, args, {
                cwd: dir,
                timeoutMs: Number(job.compileTimeoutMs) || 15000,
                maxOutputBytes: 32 * 1024,
                env,
            });
            const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
            if (result.spawnError === "ENOENT") return { error: `${command} is not installed here.`, compile: null, run: null, missingToolchain: true };
            compile = { ok: result.exitCode === 0 && !result.timedOut, output: result.timedOut ? "Compilation timed out." : output };
            if (!compile.ok) return { compile, run: null };
        }

        const [command, args] = spec.run;
        const result = await execute(command, args, {
            cwd: dir,
            input: job.stdin,
            timeoutMs: Number(job.runTimeoutMs) || 5000,
            maxOutputBytes,
            env,
        });
        if (result.spawnError === "ENOENT") return { error: `${command} is not installed here.`, compile, run: null, missingToolchain: true };
        return { compile, run: result };
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

const result = await main();
process.stdout.write(JSON.stringify(result));
