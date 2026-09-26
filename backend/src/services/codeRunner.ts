import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const RUN_TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 10000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 100 * 1024;

interface ProcResult {
    stdout: string;
    stderr: string;
    ok: boolean;
    timedOut: boolean;
    /** The interpreter/compiler itself is not installed on this machine. */
    missingToolchain: boolean;
}

/**
 * Runs one command in a throwaway working directory, as a separate OS process.
 *
 * Candidate code never executes inside the API process, so it cannot read
 * process.env (API keys, DATABASE_URL), monkey-patch globals shared with other
 * requests, or keep the server alive past the timeout. This is isolation, not a
 * true sandbox — untrusted code still runs as the server user, so a hostile
 * submission could still read files this process can read. Put the backend in a
 * container or a dedicated runner before exposing this publicly.
 */
function runProcess(command: string, args: string[], cwd: string, timeout: number): Promise<ProcResult> {
    return new Promise((resolve) => {
        execFile(
            command,
            args,
            {
                cwd,
                timeout,
                killSignal: "SIGKILL",
                maxBuffer: MAX_OUTPUT_BYTES,
                // Deliberately minimal: submitted code must not inherit our secrets.
                env: { PATH: process.env.PATH ?? "", HOME: cwd, LANG: "C.UTF-8" },
            },
            (error, stdout, stderr) => {
                const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
                resolve({
                    stdout: stdout ?? "",
                    stderr: stderr ?? "",
                    ok: !err,
                    timedOut: !!err?.killed,
                    missingToolchain: err?.code === "ENOENT",
                });
            }
        );
    });
}

function formatResult(result: ProcResult, emptySuccessMessage: string): string {
    if (result.timedOut) {
        return `Execution timed out after ${RUN_TIMEOUT_MS / 1000}s. Check for an infinite loop.`;
    }
    const combined = [result.stdout, result.stderr].filter((part) => part.trim().length > 0).join("\n").trim();
    if (combined.length > 0) return combined;
    return result.ok ? emptySuccessMessage : "Process exited with a non-zero status and produced no output.";
}

/** javac requires the file name to match the public class name. */
function javaClassName(code: string): string {
    const match = code.match(/public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    return match?.[1] ?? "Solution";
}

export async function runCode(code: unknown, language: unknown): Promise<string> {
    if (typeof code !== "string" || code.trim().length === 0) {
        return "Error: No code provided.";
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
        return `Error: Source exceeds the ${MAX_SOURCE_BYTES / 1024}KB limit.`;
    }

    const langKey = (typeof language === "string" && language.trim().length > 0 ? language : "javascript").toLowerCase();
    const dir = await mkdtemp(path.join(tmpdir(), "ai-interviewer-run-"));

    try {
        switch (langKey) {
            case "javascript": {
                const file = path.join(dir, "solution.mjs");
                await writeFile(file, code, "utf8");
                const result = await runProcess(process.execPath, [file], dir, RUN_TIMEOUT_MS);
                return formatResult(result, "Code executed successfully (no console output).");
            }

            case "typescript": {
                const file = path.join(dir, "solution.ts");
                await writeFile(file, code, "utf8");
                const result = await runProcess(
                    process.execPath,
                    ["--experimental-strip-types", "--no-warnings", file],
                    dir,
                    RUN_TIMEOUT_MS
                );
                return formatResult(result, "Code executed successfully (no console output).");
            }

            case "python": {
                const file = path.join(dir, "solution.py");
                await writeFile(file, code, "utf8");
                const result = await runProcess("python3", [file], dir, RUN_TIMEOUT_MS);
                if (result.missingToolchain) {
                    return "Python is not installed on this server, so this solution could not be run.";
                }
                return formatResult(result, "Python code executed successfully (no output).");
            }

            case "cpp": {
                const source = path.join(dir, "solution.cpp");
                const binary = path.join(dir, "solution");
                await writeFile(source, code, "utf8");

                const compiled = await runProcess("g++", ["-std=c++17", "-O0", "-o", binary, source], dir, COMPILE_TIMEOUT_MS);
                if (compiled.missingToolchain) {
                    return "No C++ compiler (g++) is installed on this server, so this solution could not be compiled or run.";
                }
                if (!compiled.ok) {
                    return `Compilation failed:\n${formatResult(compiled, "Unknown compiler error.")}`;
                }

                const result = await runProcess(binary, [], dir, RUN_TIMEOUT_MS);
                return formatResult(result, "C++ code executed successfully (no output).");
            }

            case "java": {
                const className = javaClassName(code);
                const source = path.join(dir, `${className}.java`);
                await writeFile(source, code, "utf8");

                const compiled = await runProcess("javac", [source], dir, COMPILE_TIMEOUT_MS);
                if (compiled.missingToolchain) {
                    return "No Java compiler (javac) is installed on this server, so this solution could not be compiled or run.";
                }
                if (!compiled.ok) {
                    return `Compilation failed:\n${formatResult(compiled, "Unknown compiler error.")}`;
                }

                const result = await runProcess("java", ["-cp", dir, className], dir, RUN_TIMEOUT_MS);
                return formatResult(result, "Java code executed successfully (no output).");
            }

            default:
                return `Unsupported language "${langKey}". Choose JavaScript, TypeScript, Python, C++ or Java.`;
        }
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ });
    }
}
