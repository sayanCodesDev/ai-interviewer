import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import { config } from "../config/env";
import { RunnerUnavailableError, type CodeRunner, type RunJob, type RunOutput } from "./types";

const STARTUP_MARGIN_MS = 10_000;

/** The flags that make the container a sandbox. Kept in one place so tests can assert on them. */
export function dockerArgs(name: string): string[] {
    return [
        "run",
        "--rm",
        "-i",
        "--name", name,
        // Submitted code can't reach the network, the host, or other containers.
        "--network", "none",
        "--memory", `${config.runnerMemoryMb}m`,
        "--memory-swap", `${config.runnerMemoryMb}m`,
        "--cpus", String(config.runnerCpus),
        // A fork bomb hits this ceiling instead of the host's process table.
        "--pids-limit", "256",
        "--ulimit", "nofile=512:512",
        "--ulimit", "fsize=67108864",
        "--read-only",
        "--tmpfs", "/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--user", "10001:10001",
        config.runnerImage,
    ];
}

/** Runs each job in its own throwaway container. The job travels over stdin, so nothing is bind-mounted. */
export class DockerRunner implements CodeRunner {
    readonly kind = "docker" as const;

    run(job: RunJob): Promise<RunOutput> {
        const name = `aii-run-${crypto.randomBytes(6).toString("hex")}`;
        const budgetMs = (job.compileTimeoutMs ?? 15_000) + (job.runTimeoutMs ?? 5_000) + STARTUP_MARGIN_MS;

        return new Promise<RunOutput>((resolve, reject) => {
            const child = spawn("docker", dockerArgs(name), { stdio: ["pipe", "pipe", "pipe"] });
            let stdout = "";
            let stderr = "";
            let settled = false;

            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                action();
            };

            const timer = setTimeout(() => {
                // The container overran everything it was allowed. Kill it by name; --rm then removes it.
                execFile("docker", ["kill", name], () => {});
                child.kill("SIGKILL");
                finish(() => reject(new RunnerUnavailableError("The sandbox did not finish in time.")));
            }, budgetMs);

            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString("utf8");
                if (stdout.length > 24 * 1024 * 1024) child.kill("SIGKILL");
            });
            child.stderr.on("data", (chunk) => {
                if (stderr.length < 8_192) stderr += chunk.toString("utf8");
            });
            child.on("error", (error) => finish(() => reject(new RunnerUnavailableError(`Could not start Docker: ${error.message}`))));
            child.stdin.on("error", () => {});
            child.on("close", (code) => {
                finish(() => {
                    try {
                        resolve(JSON.parse(stdout) as RunOutput);
                    } catch {
                        const detail = stderr.trim().split("\n").slice(-2).join(" ").slice(0, 300);
                        reject(new RunnerUnavailableError(`The sandbox returned no result (exit ${code}). ${detail}`.trim()));
                    }
                });
            });

            child.stdin.end(JSON.stringify(job));
        });
    }
}

let probeCache: { at: number; ok: boolean; reason?: string } | null = null;

/** Is Docker reachable, and is the runner image built? Cached briefly so the hot path stays cheap. */
export function probeDocker(force = false): Promise<{ ok: boolean; reason?: string }> {
    if (!force && probeCache && Date.now() - probeCache.at < 30_000) return Promise.resolve(probeCache);

    return new Promise((resolve) => {
        execFile("docker", ["image", "inspect", config.runnerImage, "--format", "{{.Id}}"], { timeout: 5_000 }, (error, _out, stderr) => {
            let result: { ok: boolean; reason?: string };
            if (!error) result = { ok: true };
            else if (/No such image|no such object/i.test(stderr)) {
                result = { ok: false, reason: `Runner image "${config.runnerImage}" is not built. Run: docker build -t ${config.runnerImage} backend/runner` };
            } else {
                result = { ok: false, reason: "Docker is not running or not installed." };
            }
            probeCache = { at: Date.now(), ...result };
            resolve(result);
        });
    });
}
