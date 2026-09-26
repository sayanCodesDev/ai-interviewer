import "./sandboxEnv";
import "../testing/setup";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { runTests } from "../interview/problems/runTests";
import type { Signature } from "../interview/problems/types";
import { dockerArgs, probeDocker } from "./docker";
import { describeRunner } from "./index";

// These tests attack the sandbox on purpose. They only run against Docker, because the local
// runner is not isolated and running hostile code there would be exactly the danger we guard against.
let dockerReady = false;

before(async () => {
    // Belt and braces: hostile snippets must never reach the host, so require the Docker runner explicitly.
    dockerReady = (await probeDocker(true)).ok && (await describeRunner()).kind === "docker";
});

after(() => {
    if (!dockerReady) return;
    const leftovers = execFileSync("docker", ["ps", "-a", "--filter", "name=aii-run", "--format", "{{.Names}}"]).toString().trim();
    assert.equal(leftovers, "", "every sandbox container must be gone once its run ends");
});

const SIG: Signature = { name: "probe", params: [{ name: "x", type: "int" }], returns: "string" };

async function py(body: string, expected: string | undefined = undefined) {
    return runTests({
        signature: SIG,
        language: "python",
        code: `import os, socket, sys, subprocess\n\ndef probe(x):\n${body.split("\n").map((l) => "    " + l).join("\n")}\n`,
        cases: [{ id: "c", args: [1], ...(expected !== undefined ? { expected } : {}) }],
    });
}

/** Registers a test that is skipped (decided at run time, after the readiness probe) when Docker is unavailable. */
function dockerTest(name: string, body: () => Promise<void>): void {
    test(name, async (t) => {
        if (!dockerReady) {
            t.skip("Docker or the runner image is not available");
            return;
        }
        await body();
    });
}

describe("the sandbox contains hostile code", () => {
    test("the container command applies every isolation flag", () => {
        const args = dockerArgs("x").join(" ");
        for (const flag of ["--network none", "--read-only", "--cap-drop ALL", "--security-opt no-new-privileges", "--pids-limit", "--memory", "--user 10001:10001"]) {
            assert.ok(args.includes(flag), `missing ${flag}`);
        }
    });

    dockerTest("runs as an unprivileged user with no capabilities", async () => {
        const run = await py("return str(os.getuid()) + ':' + str(os.geteuid())");
        assert.equal(run.cases[0]!.actual, "10001:10001", JSON.stringify(run));
    });

    dockerTest("cannot reach the network", async () => {
        const run = await py(
            "try:\n    socket.create_connection(('1.1.1.1', 53), timeout=3)\n    return 'CONNECTED'\nexcept OSError as e:\n    return 'blocked: ' + type(e).__name__",
        );
        assert.match(String(run.cases[0]!.actual), /^blocked/, JSON.stringify(run));
    });

    dockerTest("cannot see the host's secrets, only its own tiny environment", async () => {
        const run = await py("return ','.join(sorted(os.environ.keys()))");
        const keys = String(run.cases[0]!.actual);
        for (const secret of ["JWT_SECRET", "DATABASE_URL", "GROQ_API_KEY", "DEEPGRAM_API_KEY", "TEST_DATABASE_URL"]) {
            assert.ok(!keys.includes(secret), `${secret} leaked into the sandbox`);
        }
    });

    dockerTest("cannot read the host filesystem or write outside its scratch space", async () => {
        const run = await py(
            "out = []\nfor path in ['/Users', '/host', '/proc/1/root/Users']:\n    out.append(path + '=' + str(os.path.exists(path)))\ntry:\n    open('/etc/pwned', 'w').write('x')\n    out.append('wrote-etc')\nexcept OSError:\n    out.append('etc-readonly')\nopen('/tmp/scratch', 'w').write('ok')\nout.append('tmp-writable')\nreturn ';'.join(out)",
        );
        const actual = String(run.cases[0]!.actual);
        assert.ok(!actual.includes("=True"), actual);
        assert.ok(actual.includes("etc-readonly"), actual);
        assert.ok(actual.includes("tmp-writable"), actual);
    });

    dockerTest("a memory bomb is killed and reported, not left to eat the host", async () => {
        const run = await py("blob = bytearray(3 * 1024 * 1024 * 1024)\nreturn str(len(blob))");
        assert.notEqual(run.status, "PASSED");
        assert.equal(run.cases[0]!.status, "error");
    });

    dockerTest("a fork bomb is capped by the process limit and cleaned up", async () => {
        const run = await py("import time\nfor _ in range(100000):\n    try:\n        if os.fork() == 0:\n            time.sleep(60)\n    except OSError:\n        return 'capped'\nreturn 'unbounded'");
        assert.notEqual(run.cases[0]!.actual, "unbounded");
    });

    dockerTest("an endless loop is stopped at the time limit", async () => {
        const started = Date.now();
        const run = await py("while True:\n    pass");
        assert.equal(run.status, "TIMEOUT");
        assert.ok(Date.now() - started < 20_000, "must be stopped promptly");
    });

    dockerTest("a flood of output is truncated instead of buffered without limit", async () => {
        const run = await runTests({
            signature: SIG,
            language: "javascript",
            code: `function probe(x) { const chunk = "x".repeat(65536); for (let i = 0; i < 4000; i++) process.stdout.write(chunk); return "done"; }`,
            cases: [{ id: "c", args: [1] }],
        });
        assert.notEqual(run.cases[0]!.actual, "done");
        assert.ok(JSON.stringify(run).length < 200_000, "the report itself must stay small");
    });

    dockerTest("sub-processes cannot escape: killing the run kills what it spawned", async () => {
        const run = await py("subprocess.Popen(['sleep', '300'])\nwhile True:\n    pass");
        assert.equal(run.status, "TIMEOUT");
    });
});
