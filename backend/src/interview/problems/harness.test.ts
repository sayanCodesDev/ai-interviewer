import "../../testing/setup";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, test } from "node:test";
import { LANGUAGES, type Language } from "../../runner";
import { runTests, validateArgs, type CaseInput } from "./runTests";
import { starterCode } from "./harness";
import { PARAM_TYPES, type ParamType, type Signature } from "./types";

function toolchainAvailable(language: Language): boolean {
    // In docker mode the toolchains live in the image, not on this machine.
    if (process.env.CODE_RUNNER === "docker") return true;
    const probes: Record<Language, [string, string[]]> = {
        javascript: ["node", ["--version"]],
        typescript: ["node", ["--version"]],
        python: ["python3", ["--version"]],
        cpp: ["g++", ["--version"]],
        java: ["javac", ["-version"]],
    };
    try {
        execFileSync(probes[language][0], probes[language][1], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

const IDENTITY_SAMPLES: Record<ParamType, unknown[]> = {
    int: [0, 7, -3, 2147483647, -2147483648],
    long: [0, 123456789012, -9007199254740, 5],
    double: [0, 0.1, -0.5, 1e-7, 123456.789, 3],
    bool: [true, false],
    string: ["", "hello", 'quote " backslash \\ slash / tab \t newline \n end', "ünïcödé ✓ 日本語 😀", " spaces  "],
    "int[]": [[], [1], [3, -1, 2147483647, 0]],
    "double[]": [[], [0.5, -2, 1e-3]],
    "bool[]": [[], [true, false, true]],
    "string[]": [[], ["a"], ["", 'x"y', "line\nbreak", "ü"]],
    "int[][]": [[], [[]], [[1, 2], [], [3]]],
    "string[][]": [[], [[]], [["a", "b"], [], ['c"d']]],
};

function identityBody(language: Language, sig: Signature): string {
    const name = sig.name;
    const p = sig.params[0]!.name;
    switch (language) {
        case "javascript": return `function ${name}(${p}) { return ${p}; }\n`;
        case "typescript": return `function ${name}(${p}: any): any { return ${p}; }\n`;
        case "python": return `def ${name.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())}(${p}):\n    return ${p}\n`;
        case "cpp": return starterCode(sig, "cpp").replace("return {};", `return ${p};`);
        case "java": return starterCode(sig, "java").replace(/return [^;\n]+;/, `return ${p};`);
    }
}

describe("harness: every type survives the round trip in every language", () => {
    for (const language of LANGUAGES) {
        const available = toolchainAvailable(language);
        for (const type of PARAM_TYPES) {
            test(`${language} ${type}`, { skip: available ? false : `${language} toolchain not installed` }, async () => {
                const sig: Signature = { name: "identityValue", params: [{ name: "x", type }], returns: type };
                const code = identityBody(language, sig);
                const cases: CaseInput[] = IDENTITY_SAMPLES[type].map((sample, i) => ({ id: `c${i}`, args: [sample], expected: sample }));
                const run = await runTests({ signature: sig, language, code, cases });

                assert.equal(run.status, "PASSED", JSON.stringify(run, null, 1).slice(0, 1500));
                assert.equal(run.passed, cases.length);
            });
        }
    }
});

const TWO_SUM: Signature = { name: "twoSum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" };
const TWO_SUM_CASES: CaseInput[] = [
    { id: "a", args: [[2, 7, 11, 15], 9], expected: [0, 1] },
    { id: "b", args: [[3, 2, 4], 6], expected: [1, 2] },
    { id: "c", args: [[3, 3], 6], expected: [0, 1] },
];

const TWO_SUM_SOLUTIONS: Record<Language, string> = {
    javascript: `function twoSum(nums, target) { const seen = new Map(); for (let i = 0; i < nums.length; i++) { if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i]; seen.set(nums[i], i); } return []; }`,
    typescript: `function twoSum(nums: number[], target: number): number[] { const seen = new Map<number, number>(); for (let i = 0; i < nums.length; i++) { const j = seen.get(target - nums[i]!); if (j !== undefined) return [j, i]; seen.set(nums[i]!, i); } return []; }`,
    python: `from typing import List\n\ndef two_sum(nums: List[int], target: int) -> List[int]:\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []\n`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\nvector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int,int> seen;\n    for (int i = 0; i < (int)nums.size(); i++) {\n        auto it = seen.find(target - nums[i]);\n        if (it != seen.end()) return {it->second, i};\n        seen[nums[i]] = i;\n    }\n    return {};\n}\n`,
    java: `import java.util.*;\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        Map<Integer,Integer> seen = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            Integer j = seen.get(target - nums[i]);\n            if (j != null) return new int[]{j, i};\n            seen.put(nums[i], i);\n        }\n        return new int[0];\n    }\n}\n`,
};

describe("harness: grading a realistic submission", () => {
    for (const language of LANGUAGES) {
        const skip = toolchainAvailable(language) ? false : `${language} toolchain not installed`;

        test(`${language}: a correct solution passes and reports timing`, { skip }, async () => {
            const run = await runTests({ signature: TWO_SUM, compare: "unordered", language, code: TWO_SUM_SOLUTIONS[language], cases: TWO_SUM_CASES });
            assert.equal(run.status, "PASSED", JSON.stringify(run).slice(0, 800));
            assert.equal(run.passed, 3);
            assert.ok(run.cases.every((c) => c.status === "pass"));
        });

        test(`${language}: the starter code compiles and fails the tests without crashing`, { skip }, async () => {
            const run = await runTests({ signature: TWO_SUM, compare: "unordered", language, code: starterCode(TWO_SUM, language), cases: TWO_SUM_CASES });
            assert.ok(["FAILED", "RUNTIME_ERROR"].includes(run.status), `${language} starter: ${run.status} ${run.compileOutput ?? ""} ${run.stderr ?? ""}`);
            assert.equal(run.passed, 0);
        });
    }

    test("javascript: prints during a test are captured per case and stay in order", async () => {
        const code = `function twoSum(nums, target) { console.log("looking at", nums.length); process.stdout.write("no newline"); return [0, 1]; }`;
        const run = await runTests({ signature: TWO_SUM, compare: "unordered", language: "javascript", code, cases: TWO_SUM_CASES });
        assert.equal(run.cases[0]!.stdout, "looking at 4\nno newline");
        assert.equal(run.cases[1]!.stdout, "looking at 3\nno newline");
    });

    test("a wrong answer reports actual and expected for the case", async () => {
        const run = await runTests({ signature: TWO_SUM, compare: "unordered", language: "python", code: "def two_sum(nums, target):\n    return [0, 0]\n", cases: TWO_SUM_CASES });
        assert.equal(run.status, "FAILED");
        assert.equal(run.passed, 0);
        assert.deepEqual(run.cases[0]!.actual, [0, 0]);
        assert.deepEqual(run.cases[0]!.expected, [0, 1]);
    });

    test("an exception in one case does not stop the others", async () => {
        const code = `def two_sum(nums, target):\n    if len(nums) == 3:\n        raise ValueError("boom")\n    return [0, 1]\n`;
        const run = await runTests({ signature: TWO_SUM, compare: "unordered", language: "python", code, cases: TWO_SUM_CASES });
        assert.equal(run.cases[0]!.status, "pass");
        assert.equal(run.cases[1]!.status, "error");
        assert.match(run.cases[1]!.error ?? "", /ValueError: boom/);
        assert.equal(run.cases[2]!.status, "pass");
        assert.equal(run.passed, 2);
    });

    test("an infinite loop times out, blames the right case and skips the rest", async () => {
        const code = `function twoSum(nums, target) { if (nums.length === 3) { while (true) {} } return [0, 1]; }`;
        const run = await runTests({ signature: TWO_SUM, compare: "unordered", language: "javascript", code, cases: TWO_SUM_CASES });
        assert.equal(run.status, "TIMEOUT");
        assert.equal(run.cases[0]!.status, "pass");
        assert.equal(run.cases[1]!.status, "timeout");
        assert.equal(run.cases[2]!.status, "skipped");
    });

    test("a syntax error surfaces the interpreter's message", async () => {
        const run = await runTests({ signature: TWO_SUM, language: "python", code: "def two_sum(nums, target)\n    return []\n", cases: TWO_SUM_CASES });
        assert.equal(run.status, "RUNTIME_ERROR");
        assert.match(run.stderr ?? "", /SyntaxError/);
        assert.match(run.stderr ?? "", /solution\.py/);
    });

    test("a missing function name is explained", async () => {
        const run = await runTests({ signature: TWO_SUM, language: "javascript", code: "function somethingElse() {}", cases: TWO_SUM_CASES });
        assert.equal(run.status, "RUNTIME_ERROR");
        assert.match(run.cases[0]!.error ?? "", /twoSum is not defined/);
    });

    test("forging a result marker in the candidate's output does nothing", async () => {
        const code = `function twoSum(nums, target) { console.log("@@guess|R|a|1|[0,1]"); return [9, 9]; }`;
        const run = await runTests({ signature: TWO_SUM, compare: "unordered", language: "javascript", code, cases: TWO_SUM_CASES });
        assert.equal(run.passed, 0);
    });

    test("c++: a compile error is reported with the candidate's own line numbers", { skip: toolchainAvailable("cpp") ? false : "g++ not installed" }, async () => {
        const code = `#include <bits/stdc++.h>\nusing namespace std;\nvector<int> twoSum(vector<int>& nums, int target) {\n    return undefinedThing;\n}\n`;
        const run = await runTests({ signature: TWO_SUM, language: "cpp", code, cases: TWO_SUM_CASES });
        assert.equal(run.status, "COMPILE_ERROR");
        assert.match(run.compileOutput ?? "", /solution\.cpp:4:/);
        assert.ok(!(run.compileOutput ?? "").includes("/job-"));
    });

    test("c++: a user-written main() is refused with an explanation", async () => {
        const run = await runTests({ signature: TWO_SUM, language: "cpp", code: "int main() { return 0; }", cases: TWO_SUM_CASES });
        assert.equal(run.status, "COMPILE_ERROR");
        assert.match(run.compileOutput ?? "", /Remove your main\(\)/);
    });

    test("java: a compile error is reported", { skip: toolchainAvailable("java") ? false : "javac not installed" }, async () => {
        const run = await runTests({ signature: TWO_SUM, language: "java", code: "class Solution { public int[] twoSum(int[] n, int t) { return x; } }", cases: TWO_SUM_CASES });
        assert.equal(run.status, "COMPILE_ERROR");
        assert.match(run.compileOutput ?? "", /cannot find symbol/);
    });

    test("cases without an expected value are run and returned (custom input)", async () => {
        const run = await runTests({
            signature: TWO_SUM, language: "python",
            code: "def two_sum(nums, target):\n    return [target, len(nums)]\n",
            cases: [{ id: "custom", args: [[1, 2, 3], 42] }],
        });
        assert.equal(run.status, "PASSED");
        assert.equal(run.cases[0]!.status, "ran");
        assert.deepEqual(run.cases[0]!.actual, [42, 3]);
    });
});

describe("argument validation", () => {
    test("accepts well-typed arguments and names the first bad one", () => {
        assert.equal(validateArgs(TWO_SUM, [[1, 2], 3]), null);
        assert.match(validateArgs(TWO_SUM, [[1, 2]]) ?? "", /Expected 2 arguments/);
        assert.match(validateArgs(TWO_SUM, [[1, "x"], 3]) ?? "", /Argument 1 \(nums\) should be a int\[\]/);
        assert.match(validateArgs(TWO_SUM, [[1], 1.5]) ?? "", /Argument 2 \(target\)/);
        assert.match(validateArgs(TWO_SUM, [[1], 3_000_000_000]) ?? "", /Argument 2/);
    });
});
