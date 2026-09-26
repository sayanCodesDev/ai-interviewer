import "../../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LANGUAGES } from "../../runner";
import { starterCode } from "./harness";
import { ALL_PROBLEMS } from "./index";
import { runTests } from "./runTests";

// Compiling 38 problems x 5 languages is slow, so this only runs on request: SLOW_TESTS=1 npm test.
// It proves that every generated signature is valid code in every language.
const enabled = process.env.SLOW_TESTS === "1";

describe("starter code for every problem compiles and runs in every language", { skip: enabled ? false : "set SLOW_TESTS=1 to run" }, () => {
    for (const language of LANGUAGES) {
        test(language, async () => {
            const failures: string[] = [];
            const queue = [...ALL_PROBLEMS];
            const worker = async () => {
                for (let def = queue.shift(); def; def = queue.shift()) {
                    const run = await runTests({
                        signature: def.signature,
                        compare: def.compare,
                        language,
                        code: starterCode(def.signature, language),
                        cases: [{ id: "e0", args: def.examples[0]!.input, expected: def.examples[0]!.output }],
                    });
                    // The starter is a stub, so it must build and run; it just shouldn't pass.
                    if (run.status === "COMPILE_ERROR" || run.status === "ERROR") failures.push(`${def.key}: ${run.status} ${run.compileOutput ?? run.message ?? ""}`.slice(0, 300));
                    else if (run.status === "RUNTIME_ERROR" && run.cases[0]?.status !== "error") failures.push(`${def.key}: ${run.status} ${run.stderr ?? ""}`.slice(0, 300));
                }
            };
            await Promise.all([worker(), worker(), worker(), worker()]);
            assert.deepEqual(failures, []);
        });
    }
});
