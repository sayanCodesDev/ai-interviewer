import "../../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LANGUAGES } from "../../runner";
import { ALL_PROBLEMS, expectedOutputs, publicView, redactHidden, runAll, runCustom, runExamples, selectProblems, validateProblemDef, KNOWN_TAGS } from "./index";
import { JS_SOLUTIONS } from "./verify/jsSolutions";

describe("problem bank", () => {
    test("has a healthy spread and every problem is structurally valid", () => {
        assert.ok(ALL_PROBLEMS.length >= 30, `only ${ALL_PROBLEMS.length} problems`);
        for (const difficulty of ["easy", "medium", "hard"]) {
            assert.ok(ALL_PROBLEMS.filter((p) => p.difficulty === difficulty).length >= 5, `too few ${difficulty} problems`);
        }
        for (const def of ALL_PROBLEMS) assert.deepEqual(validateProblemDef(def), [], def.key);
    });

    test("every problem has an independent JavaScript solution used to cross-check it", () => {
        for (const def of ALL_PROBLEMS) assert.ok(JS_SOLUTIONS[def.key], `missing JS solution for ${def.key}`);
    });

    test("the public view never exposes hidden tests, hints or the reference", () => {
        for (const def of ALL_PROBLEMS) {
            const shown = JSON.stringify(publicView(def));
            assert.ok(!shown.includes("hidden"), def.key);
            assert.ok(!shown.includes(def.reference.slice(0, 40)), def.key);
            assert.ok(!shown.includes(def.hints[2].slice(0, 30)), def.key);
            assert.deepEqual(Object.keys(publicView(def).starter).sort(), [...LANGUAGES].sort());
        }
    });

    test("selection ramps up difficulty, avoids repeats and is deterministic", () => {
        const a = selectProblems({ count: 3, level: "mid", seed: "interview-1" });
        const b = selectProblems({ count: 3, level: "mid", seed: "interview-1" });
        assert.deepEqual(a, b);
        assert.equal(new Set(a).size, 3);

        const intern = selectProblems({ count: 2, level: "intern", seed: "x" }).map((k) => ALL_PROBLEMS.find((p) => p.key === k)!.difficulty);
        assert.deepEqual(intern, ["easy", "easy"]);
        const staff = selectProblems({ count: 1, level: "staff", seed: "y" }).map((k) => ALL_PROBLEMS.find((p) => p.key === k)!.difficulty);
        assert.deepEqual(staff, ["hard"]);
    });

    test("selection prefers the topics a job description asks for", () => {
        const picks = selectProblems({ count: 3, level: "mid", preferredTags: ["graph"], seed: "graph-heavy" });
        const graphish = picks.filter((k) => ALL_PROBLEMS.find((p) => p.key === k)!.tags.includes("graph"));
        assert.ok(graphish.length >= 1, `expected a graph problem in ${picks}`);
        assert.ok(KNOWN_TAGS.includes("graph"));
    });
});

// Runs on the local runner (no Docker needed) so it stays fast; it exercises every problem's tests.
describe("every problem: an independent solution passes every hidden test", () => {
    for (const def of ALL_PROBLEMS) {
        test(def.key, async () => {
            const run = await runAll(def, "javascript", JS_SOLUTIONS[def.key]!);
            const failed = run.cases.filter((c) => c.status !== "pass").map((c) => `${c.id} ${c.label} ${c.status} ${c.error ?? ""}`);
            assert.equal(run.status, "PASSED", `${def.key}: ${failed.slice(0, 4).join(" | ")} ${run.stderr ?? ""}`);
            assert.equal(run.passed, def.examples.length + def.hidden.length);
        });
    }
});

describe("running problems the way an interview does", () => {
    const two = ALL_PROBLEMS.find((p) => p.key === "two-sum")!;
    const solve = JS_SOLUTIONS["two-sum"]!;

    test("Run grades only the examples and shows their data", async () => {
        const run = await runExamples(two, "javascript", solve);
        assert.equal(run.total, two.examples.length);
        assert.equal(run.status, "PASSED");
        assert.ok(run.cases.every((c) => !c.hidden && c.expected !== undefined));
    });

    test("Submit grades hidden cases too, and redaction removes their data", async () => {
        const wrong = `function twoSum(nums, target) { return [0, 1]; }`;
        const run = await runAll(two, "javascript", wrong);
        assert.equal(run.status, "FAILED");
        assert.equal(run.total, two.examples.length + two.hidden.length);
        const safe = redactHidden(run);
        for (const c of safe.cases.filter((x) => x.hidden)) {
            assert.deepEqual(Object.keys(c).sort(), ["hidden", "id", "label", "ms", "status"].sort().filter((k) => k in c));
            assert.equal((c as any).expected, undefined);
            assert.equal((c as any).actual, undefined);
        }
        assert.ok(safe.cases.some((c) => c.hidden && c.label));
    });

    test("a broken reference solution gives the candidate an ERROR result instead of throwing", async () => {
        const broken = { ...two, key: "two-sum-broken-reference", reference: "def two_sum(:\n    pass\n" };
        const run = await runAll(broken, "javascript", solve);
        assert.equal(run.status, "ERROR");
        assert.match(run.message ?? "", /try submitting again/i);
        assert.doesNotMatch(run.message ?? "", /reference/i);
    });

    test("expected outputs are computed once and cached", async () => {
        const first = await expectedOutputs(two);
        const second = await expectedOutputs(two);
        assert.equal(first, second);
        assert.equal(first.length, two.hidden.length);
    });

    test("custom input runs the function and returns its result", async () => {
        const run = await runCustom(two, "javascript", solve, [[1, 2, 3, 4], 7]);
        assert.equal(run.cases[0]!.status, "ran");
        assert.deepEqual((run.cases[0]!.actual as number[]).sort(), [2, 3]);
    });
});
