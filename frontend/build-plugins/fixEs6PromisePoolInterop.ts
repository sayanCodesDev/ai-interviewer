import type { BunPlugin } from "bun";
import { readFileSync } from "node:fs";

/**
 * @excalidraw/excalidraw depends on es6-promise-pool, a UMD module whose wrapper checks for an AMD loader
 * *before* CommonJS:
 *
 *     if (typeof define === 'function' && define.amd) define([], factory)
 *     else if (typeof exports === 'object') module.exports = factory()
 *
 * The interview room preloads Monaco, and Monaco's loader leaves exactly such a global `define` on the page.
 * So in the room, es6-promise-pool hands itself to Monaco's loader and exports nothing; Excalidraw's
 * `import PromisePool from "es6-promise-pool"` gets an empty object, and the whiteboard crashes with
 * "...es6_promise_pool.default is not a constructor" as soon as it loads its fonts.
 *
 * This replaces the import with a small ES module that runs the library's own source with `define` hidden
 * (so it always takes the CommonJS branch) and default-exports the result. Used by both `bun run dev`
 * (bunfig.toml's [serve.static] plugins) and the production build (build.ts).
 */
export const fixEs6PromisePoolInterop: BunPlugin = {
    name: "fix-es6-promise-pool-interop",
    setup(build) {
        const source = readFileSync(require.resolve("es6-promise-pool"), "utf8");

        build.onResolve({ filter: /^es6-promise-pool$/ }, () => ({
            path: "es6-promise-pool",
            namespace: "fix-es6-promise-pool-interop",
        }));
        build.onLoad({ filter: /.*/, namespace: "fix-es6-promise-pool-interop" }, () => ({
            contents: [
                "const cjs = { exports: {} };",
                "(function (define, module, exports) {",
                source,
                "}).call(globalThis, undefined, cjs, cjs.exports);",
                "export default cjs.exports;",
            ].join("\n"),
            loader: "js",
        }));
    },
};

export default fixEs6PromisePoolInterop;
