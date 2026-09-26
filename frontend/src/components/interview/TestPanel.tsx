import { Check, CircleAlert, Clock, Minus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatInputs, formatValue } from "@/lib/format";
import type { CaseResult, CaseStatus, PublicProblem, TestRun } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "cases" | "output" | "custom";

const STATUS_ICON: Record<CaseStatus, React.ReactNode> = {
    pass: <Check className="size-3.5 text-signal" />,
    fail: <X className="size-3.5 text-night-red" />,
    error: <CircleAlert className="size-3.5 text-night-red" />,
    timeout: <Clock className="size-3.5 text-night-amber" />,
    skipped: <Minus className="size-3.5 text-night-muted" />,
    ran: <Check className="size-3.5 text-night-muted" />,
};

const STATUS_WORD: Record<CaseStatus, string> = {
    pass: "Passed",
    fail: "Wrong answer",
    error: "Runtime error",
    timeout: "Too slow",
    skipped: "Not run",
    ran: "Ran",
};

function Pre({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "bad" | "good" }) {
    return (
        <div>
            <p className="label-mono mb-1 text-night-muted">{label}</p>
            <pre
                className={cn(
                    "max-h-32 overflow-auto rounded-md border border-night-line bg-night-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap",
                    tone === "bad" && "border-night-red/40",
                    tone === "good" && "border-signal/30",
                )}
            >
                {children}
            </pre>
        </div>
    );
}

interface TestPanelProps {
    problem: PublicProblem;
    /** The last "Run" (visible examples). */
    runResult: TestRun | null;
    /** The last graded submission (visible examples plus hidden cases). */
    submitResult: TestRun | null;
    running: boolean;
    submitting: boolean;
    customResult: TestRun | null;
    customRunning: boolean;
    onRunCustom: (args: unknown[]) => void;
    /** Shown while results are stale relative to the code, so nobody reads yesterday's pass as today's. */
    stale: boolean;
}

/** Test cases, the output of the last run, and a scratch input, in the style of a real coding-interview tool. */
export function TestPanel({ problem, runResult, submitResult, running, submitting, customResult, customRunning, onRunCustom, stale }: TestPanelProps) {
    const [tab, setTab] = useState<Tab>("cases");
    const [selected, setSelected] = useState("e0");
    const [inputs, setInputs] = useState<string[]>(() => problem.signature.params.map((_, i) => formatValue(problem.examples[0]?.input[i])));
    const [inputError, setInputError] = useState<string | null>(null);

    // A new problem gets fresh custom inputs.
    useEffect(() => {
        setInputs(problem.signature.params.map((_, i) => formatValue(problem.examples[0]?.input[i])));
        setSelected("e0");
        setInputError(null);
    }, [problem.key, problem.signature.params, problem.examples]);

    // Show fresh results as they arrive.
    useEffect(() => {
        if (runResult || submitResult) setTab("cases");
    }, [runResult, submitResult]);

    const latest = submitResult ?? runResult;
    const results = useMemo(() => new Map((latest?.cases ?? []).map((c) => [c.id, c])), [latest]);
    const hiddenCases = (submitResult?.cases ?? []).filter((c) => c.hidden);
    const selectedResult: CaseResult | undefined = results.get(selected);
    const selectedExample = /^e(\d+)$/.exec(selected) ? problem.examples[Number(/^e(\d+)$/.exec(selected)![1])] : undefined;

    const summary = submitResult
        ? `Submitted: ${submitResult.passed} of ${submitResult.total} tests passed`
        : runResult
            ? `Examples: ${runResult.passed} of ${runResult.total} passed`
            : "Run your code to check the examples";

    const headline = latest?.status;
    const problemLine =
        headline === "COMPILE_ERROR" ? "Compilation failed" :
        headline === "RUNTIME_ERROR" ? "Runtime error" :
        headline === "TIMEOUT" ? "Time limit exceeded" :
        headline === "ERROR" ? "Couldn't run" : null;

    function runCustom() {
        try {
            const args = inputs.map((text, i) => {
                try {
                    return JSON.parse(text);
                } catch {
                    throw new Error(`${problem.signature.params[i]!.name} must be valid JSON, like [1, 2, 3] or "text".`);
                }
            });
            setInputError(null);
            onRunCustom(args);
        } catch (error) {
            setInputError((error as Error).message);
        }
    }

    const tabs: Array<[Tab, string]> = [["cases", "Test cases"], ["output", "Output"], ["custom", "Custom input"]];

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Results" className="flex shrink-0 items-center gap-1 border-b border-night-line px-2">
                {tabs.map(([id, label]) => (
                    <button
                        key={id}
                        role="tab"
                        type="button"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={cn(
                            "relative px-3 py-2 text-[13px] transition-colors",
                            tab === id ? "text-night-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-signal" : "text-night-muted hover:text-night-foreground",
                        )}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto flex items-center gap-2 pr-2 font-mono text-[12px] text-night-muted" aria-live="polite">
                    {(running || submitting) && <Spinner className="size-3.5" />}
                    {running ? "Running…" : submitting ? "Grading…" : stale && latest ? "Code changed since this result" : summary}
                </span>
            </div>

            <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-3">
                {tab === "cases" && (
                    <div className="grid gap-3">
                        {problemLine && <p role="alert" className="text-[13px] font-medium text-night-red">{problemLine}. See the Output tab.</p>}
                        <div className="flex flex-wrap gap-1.5">
                            {problem.examples.map((_, i) => {
                                const id = `e${i}`;
                                const status = results.get(id)?.status;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelected(id)}
                                        aria-pressed={selected === id}
                                        className={cn(
                                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors",
                                            selected === id ? "border-night-muted bg-night-raised" : "border-night-line text-night-muted hover:text-night-foreground",
                                        )}
                                    >
                                        {status && STATUS_ICON[status]}
                                        Example {i + 1}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedExample && (
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                <Pre label="Input">{formatInputs(problem.signature.params, selectedExample.input)}</Pre>
                                <Pre label="Expected" tone="good">{formatValue(selectedExample.output)}</Pre>
                                {selectedResult && selectedResult.status !== "skipped" && (
                                    <Pre label={`Your output · ${STATUS_WORD[selectedResult.status]}${selectedResult.ms !== undefined ? ` · ${selectedResult.ms} ms` : ""}`} tone={selectedResult.status === "pass" ? "good" : "bad"}>
                                        {selectedResult.error ?? formatValue(selectedResult.actual)}
                                    </Pre>
                                )}
                            </div>
                        )}

                        {hiddenCases.length > 0 && (
                            <div>
                                <p className="label-mono mb-1.5 text-night-muted">Hidden tests</p>
                                <ul className="grid gap-1 sm:grid-cols-2">
                                    {hiddenCases.map((c) => (
                                        <li key={c.id} className="flex items-center gap-2 rounded-md border border-night-line px-2.5 py-1.5 text-[12.5px]">
                                            {STATUS_ICON[c.status]}
                                            <span className="min-w-0 flex-1 truncate">{c.label ?? c.id}</span>
                                            <span className="text-night-muted">{STATUS_WORD[c.status]}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-[12px] text-night-muted">Hidden tests show only their name and result, like a real assessment.</p>
                            </div>
                        )}
                    </div>
                )}

                {tab === "output" && (
                    <div className="grid gap-3">
                        {latest?.compileOutput && <Pre label="Compiler output" tone="bad">{latest.compileOutput}</Pre>}
                        {latest?.stderr && <Pre label="Error" tone="bad">{latest.stderr}</Pre>}
                        {latest?.message && <Pre label="Note">{latest.message}</Pre>}
                        {(latest?.cases ?? []).filter((c) => !c.hidden && c.stdout).map((c) => (
                            <Pre key={c.id} label={`Printed during ${c.label ?? c.id}`}>{c.stdout}</Pre>
                        ))}
                        {(latest?.cases ?? []).filter((c) => c.error).map((c) => (
                            <Pre key={`${c.id}-error`} label={`${c.label ?? c.id}: error`} tone="bad">{c.error}</Pre>
                        ))}
                        {!latest && <p className="text-[13px] text-night-muted">Run your code to see anything it prints, and any errors, here.</p>}
                        {latest && !latest.compileOutput && !latest.stderr && !latest.message && !latest.cases.some((c) => c.stdout || c.error) && (
                            <p className="text-[13px] text-night-muted">Nothing was printed and there were no errors.</p>
                        )}
                    </div>
                )}

                {tab === "custom" && (
                    <div className="grid gap-3">
                        <p className="text-[13px] text-night-muted">Try the function on your own input. Each value is JSON, in the order of the parameters.</p>
                        {problem.signature.params.map((param, i) => (
                            <label key={param.name} className="grid gap-1">
                                <span className="label-mono text-night-muted">{param.name} <span className="normal-case opacity-70">({param.type})</span></span>
                                <textarea
                                    value={inputs[i] ?? ""}
                                    onChange={(event) => setInputs((current) => current.map((v, j) => (j === i ? event.target.value : v)))}
                                    rows={2}
                                    spellCheck={false}
                                    className="w-full resize-y rounded-md border border-night-line bg-night-sunken px-3 py-2 font-mono text-[12.5px] outline-none focus-visible:border-signal/60"
                                />
                            </label>
                        ))}
                        {inputError && <p role="alert" className="text-[13px] text-night-red">{inputError}</p>}
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" onClick={runCustom} disabled={customRunning}>
                                {customRunning && <Spinner />}
                                Run with this input
                            </Button>
                        </div>
                        {customResult && (
                            <div className="grid gap-2.5">
                                {customResult.compileOutput && <Pre label="Compiler output" tone="bad">{customResult.compileOutput}</Pre>}
                                {customResult.stderr && <Pre label="Error" tone="bad">{customResult.stderr}</Pre>}
                                {customResult.cases[0] && (
                                    <>
                                        <Pre label={`Returned${customResult.cases[0].ms !== undefined ? ` · ${customResult.cases[0].ms} ms` : ""}`} tone={customResult.cases[0].error ? "bad" : undefined}>
                                            {customResult.cases[0].error ?? formatValue(customResult.cases[0].actual)}
                                        </Pre>
                                        {customResult.cases[0].stdout && <Pre label="Printed">{customResult.cases[0].stdout}</Pre>}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
