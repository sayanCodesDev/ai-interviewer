import { config } from "../config/env";
import { logger } from "../observability/logger";
import { DockerRunner, probeDocker } from "./docker";
import { LocalRunner } from "./local";
import { Semaphore } from "./semaphore";
import { RunnerUnavailableError, type CodeRunner, type RunJob, type RunOutput } from "./types";

export * from "./types";

const limiter = new Semaphore(config.runnerConcurrency);
let overrideRunner: CodeRunner | null = null;
let warnedLocal = false;

/** Tests swap in a fake; pass null to restore normal selection. */
export function setRunnerForTesting(runner: CodeRunner | null): void {
    overrideRunner = runner;
}

/**
 * Chooses where candidate code runs. Docker whenever it works. "auto" (the development default)
 * falls back to running on this machine with a loud warning; production never does unless told to.
 */
async function selectRunner(): Promise<CodeRunner> {
    if (overrideRunner) return overrideRunner;

    if (config.codeRunner === "local") {
        if (!warnedLocal) {
            logger.warn("CODE_RUNNER=local: candidate code runs directly on this machine with no isolation.");
            warnedLocal = true;
        }
        return new LocalRunner();
    }

    const docker = await probeDocker();
    if (docker.ok) return new DockerRunner();

    if (config.codeRunner === "auto" && !config.isProduction) {
        if (!warnedLocal) {
            logger.warn(`${docker.reason} Falling back to the UNSANDBOXED local runner (development only).`);
            warnedLocal = true;
        }
        return new LocalRunner();
    }
    throw new RunnerUnavailableError(docker.reason ?? "The code sandbox is unavailable.");
}

/** Which runner would serve a request right now, for health checks and startup logs. */
export async function describeRunner(): Promise<{ kind: string; ok: boolean; reason?: string }> {
    try {
        const runner = await selectRunner();
        return { kind: runner.kind, ok: true };
    } catch (error) {
        return { kind: config.codeRunner, ok: false, reason: (error as Error).message };
    }
}

/** Runs a job with bounded concurrency, so a burst of submissions queues instead of exhausting the host. */
export async function runJob(job: RunJob): Promise<RunOutput> {
    const runner = await selectRunner();
    return limiter.use(() => runner.run(job));
}
