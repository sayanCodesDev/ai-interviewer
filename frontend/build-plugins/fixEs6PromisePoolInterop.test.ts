import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixEs6PromisePoolInterop } from "./fixEs6PromisePoolInterop";

type PromisePoolClass = new (source: () => Promise<unknown> | null, concurrency: number) => { start(): Promise<void> };

/** Bundles `import PromisePool from "es6-promise-pool"` exactly as Excalidraw's own bundle writes it. */
async function bundleDefaultImport(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "promise-pool-"));
    try {
        const entry = join(dir, "entry.js");
        await writeFile(entry, `import PromisePool from "es6-promise-pool";\nglobalThis.__testPromisePool = PromisePool;\n`);
        const result = await Bun.build({ entrypoints: [entry], target: "browser", format: "iife", plugins: [fixEs6PromisePoolInterop] });
        if (!result.success) throw new AggregateError(result.logs, "The bundle failed to build");
        return await result.outputs[0]!.text();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function loadInPage(code: string): PromisePoolClass {
    new Function(code)();
    return (globalThis as Record<string, unknown>).__testPromisePool as PromisePoolClass;
}

async function runsThreeJobs(PromisePool: PromisePoolClass): Promise<number> {
    let started = 0;
    const pool = new PromisePool(() => (started < 3 ? Promise.resolve(started++) : null), 2);
    await pool.start();
    return started;
}

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
    delete globals.__testPromisePool;
    delete globals.define;
});

describe("fixEs6PromisePoolInterop", () => {
    test("Excalidraw's default import is the PromisePool class itself", async () => {
        const PromisePool = loadInPage(await bundleDefaultImport());
        expect(typeof PromisePool).toBe("function");
        expect(await runsThreeJobs(PromisePool)).toBe(3);
    });

    // The interview room preloads Monaco, whose loader leaves an AMD `define` on the page. es6-promise-pool's
    // UMD wrapper checks for AMD before CommonJS, so without the fix it hands itself to Monaco's loader and
    // exports nothing: the whiteboard then crashes with "…es6_promise_pool.default is not a constructor".
    test("still works after Monaco's AMD loader has put a global `define` on the page", async () => {
        const amdCalls: unknown[] = [];
        globals.define = Object.assign((...args: unknown[]) => { amdCalls.push(args); }, { amd: {} });

        const PromisePool = loadInPage(await bundleDefaultImport());
        expect(typeof PromisePool).toBe("function");
        expect(await runsThreeJobs(PromisePool)).toBe(3);
        expect(amdCalls).toHaveLength(0);
    });
});
