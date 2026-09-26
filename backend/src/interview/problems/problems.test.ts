import "../../testing/setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LANGUAGES } from "../../runner";
import { ALL_PROBLEMS, KNOWN_TAGS, chooseNextProblem, expectedOutputs, getProblemDef, judgeOutcome, publicView, redactHidden, runAll, runCustom, runExamples, selectProblems, validateProblemDef } from "./index";
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

describe("choosing problems for the person, not at random", () => {
    const diff = (key: string) => getProblemDef(key)!.difficulty;
    const tagsOf = (keys: string[]) => keys.flatMap((k) => getProblemDef(k)!.tags);

    test("a strong pull toward a topic wins over an otherwise equal problem", () => {
        for (const seed of ["a", "b", "c", "d", "e", "f"]) {
            const picks = selectProblems({ count: 2, level: "mid", tagWeights: { intervals: 4, sorting: 2 }, seed });
            assert.ok(tagsOf(picks).includes("intervals"), `${seed}: ${picks}`);
        }
        for (const seed of ["a", "b", "c", "d", "e", "f"]) {
            const picks = selectProblems({ count: 2, level: "mid", tagWeights: { "dynamic-programming": 4 }, seed });
            assert.ok(tagsOf(picks).includes("dynamic-programming"), `${seed}: ${picks}`);
        }
    });

    test("the pull never overrides the level: interns still get easy problems whatever the job description says", () => {
        const picks = selectProblems({ count: 2, level: "intern", tagWeights: { "dynamic-programming": 4, backtracking: 4, "monotonic-stack": 4 }, seed: "z" });
        assert.deepEqual(picks.map(diff), ["easy", "easy"]);
    });

    test("the same interview always gets the same problems, and different interviews vary", () => {
        const weights = { array: 1 };
        const one = selectProblems({ count: 3, level: "mid", tagWeights: weights, seed: "i-1" });
        assert.deepEqual(one, selectProblems({ count: 3, level: "mid", tagWeights: weights, seed: "i-1" }));
        const different = new Set(Array.from({ length: 12 }, (_, i) => selectProblems({ count: 3, level: "mid", tagWeights: weights, seed: `i-${i}` }).join()));
        assert.ok(different.size >= 4, `only ${different.size} distinct sets`);
    });

    test("judging how a problem went", () => {
        assert.equal(judgeOutcome({ passed: true, attempts: 1, hints: 0, movedOn: false }), "solved_clean");
        assert.equal(judgeOutcome({ passed: true, attempts: 2, hints: 0, movedOn: false }), "solved_with_help");
        assert.equal(judgeOutcome({ passed: true, attempts: 1, hints: 1, movedOn: false }), "solved_with_help");
        assert.equal(judgeOutcome({ passed: false, attempts: 3, hints: 0, movedOn: false }), "failed");
        assert.equal(judgeOutcome({ passed: false, attempts: 0, hints: 2, movedOn: true }), "moved_on");
    });

    test("harder after a clean solve, the same after a solve that needed help, easier after one they could not finish", () => {
        const previous = getProblemDef("longest-substring-without-repeating-characters")!;
        assert.equal(previous.difficulty, "medium");
        const next = (outcome: Parameters<typeof judgeOutcome>[0] extends never ? never : "solved_clean" | "solved_with_help" | "failed" | "moved_on", level: "junior" | "mid" | "senior" = "mid") =>
            chooseNextProblem({ level, previous, outcome, tagWeights: {}, exclude: [previous.key], seed: "s" })!.difficulty;
        assert.equal(next("solved_clean"), "hard");
        assert.equal(next("solved_with_help"), "medium");
        assert.equal(next("failed"), "easy");
        assert.equal(next("moved_on"), "easy");
        assert.equal(next("failed", "senior"), "medium", "a senior candidate is not dropped to a warm-up problem");
    });

    test("interns are never pushed past medium, and nothing is ever repeated", () => {
        const previous = getProblemDef("three-sum")!;
        const pick = chooseNextProblem({ level: "intern", previous, outcome: "solved_clean", tagWeights: {}, exclude: [previous.key], seed: "s" })!;
        assert.notEqual(pick.difficulty, "hard");
        const all = ALL_PROBLEMS.filter((p) => p.difficulty === "medium").map((p) => p.key);
        const again = chooseNextProblem({ level: "mid", previous, outcome: "solved_with_help", tagWeights: {}, exclude: all, seed: "s" })!;
        assert.ok(!all.includes(again.key), "every medium problem was excluded, so a neighbouring difficulty is used instead");
    });

    test("the next problem still follows the job description", () => {
        const previous = getProblemDef("two-sum")!;
        for (const seed of ["a", "b", "c", "d"]) {
            const pick = chooseNextProblem({ level: "mid", previous, outcome: "solved_clean", tagWeights: { "dynamic-programming": 4 }, exclude: [previous.key], seed })!;
            assert.ok(pick.tags.includes("dynamic-programming"), `${seed}: ${pick.key}`);
        }
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
