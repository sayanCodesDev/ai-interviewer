import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RunnerUnavailableError, type CodeRunner, type RunJob, type RunOutput } from "./types";

const RUNNER_SCRIPT = fileURLToPath(new URL("../../runner/runner.mjs", import.meta.url));

/**
 * Runs the same runner script directly on this machine. NOT a sandbox: submitted code runs as the
 * server's user, with the server's filesystem. It exists so development and tests work without Docker.
 * Production refuses to start with it unless ALLOW_UNSAFE_LOCAL_EXEC is set.
 */
export class LocalRunner implements CodeRunner {
    readonly kind = "local" as const;

    run(job: RunJob): Promise<RunOutput> {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [RUNNER_SCRIPT], {
                stdio: ["pipe", "pipe", "pipe"],
                // The runner script clears the environment for the submitted program itself.
                env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
            });
            let stdout = "";
            child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
            child.on("error", (error) => reject(new RunnerUnavailableError(error.message)));
            child.stdin.on("error", () => {});
            child.on("close", () => {
                try {
                    resolve(JSON.parse(stdout) as RunOutput);
                } catch {
                    reject(new RunnerUnavailableError("The local runner returned no result."));
                }
            });
            child.stdin.end(JSON.stringify(job));
        });
    }
}
