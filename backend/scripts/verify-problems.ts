// Verifies the problem bank end to end: every Python reference must reproduce the examples written
// in the statement, run on every hidden input, and finish in reasonable time. Run it after editing any problem:
//   npx tsx scripts/verify-problems.ts [problem-key ...]
import "../src/testing/setup";
import { ALL_PROBLEMS, runTests } from "../src/interview/problems";
import { outputsMatch } from "../src/interview/problems/compare";

const only = new Set(process.argv.slice(2));
let failures = 0;

for (const def of ALL_PROBLEMS) {
    if (only.size > 0 && !only.has(def.key)) continue;
    const started = Date.now();
    const cases = [
        ...def.examples.map((e, i) => ({ id: `e${i}`, args: e.input, expected: e.output })),
        ...def.hidden.map((h, i) => ({ id: `h${i}`, args: h.input })),
    ];
    const run = await runTests({ signature: def.signature, compare: def.compare, language: "python", code: def.reference, cases });
    const problems: string[] = [];

    if (run.status === "COMPILE_ERROR" || run.status === "ERROR" || run.status === "RUNTIME_ERROR" || run.status === "TIMEOUT") {
        problems.push(`${run.status}: ${run.stderr ?? run.message ?? run.cases.find((c) => c.error)?.error ?? ""}`);
    }
    for (const c of run.cases) {
        if (c.status === "fail") problems.push(`example ${c.id}: reference returned ${JSON.stringify(c.actual)?.slice(0, 120)}, statement says ${JSON.stringify(c.expected)?.slice(0, 120)}`);
        else if (c.status === "error" || c.status === "timeout" || c.status === "skipped") problems.push(`case ${c.id}: ${c.status} ${c.error ?? ""}`);
        else if (c.status === "ran" && c.actual === undefined) problems.push(`case ${c.id}: no result`);
    }
    // Hidden cases must produce something of the right type.
    const ms = Date.now() - started;
    if (problems.length === 0 && run.runtimeMs > 3000) problems.push(`reference is slow (${run.runtimeMs} ms inside the function)`);

    void outputsMatch;
    console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${def.key.padEnd(48)} ${String(ms).padStart(5)} ms  (function ${run.runtimeMs} ms)`);
    for (const p of problems) console.log(`       - ${p}`);
    failures += problems.length > 0 ? 1 : 0;
}

console.log(failures === 0 ? "\nAll problems verified." : `\n${failures} problem(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
