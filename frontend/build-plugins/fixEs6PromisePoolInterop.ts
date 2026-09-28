import type { BunPlugin } from "bun";

/**
 * @excalidraw/excalidraw depends on es6-promise-pool, a plain UMD/CommonJS module
 * (`module.exports = PromisePool`; no `.default` property at all). Bun's bundler still
 * generates `.default` access for the `import PromisePool from "es6-promise-pool"` statement
 * baked into Excalidraw's own prebuilt bundle, so the moment that code path runs it throws
 * "...es6_promise_pool.default is not a constructor" — reproduces identically in `bun run dev`
 * (via bunfig.toml's [serve.static] plugins) and the production build (via build.ts).
 *
 * Redirects the import to a tiny shim that gives it a real `export default`, which Bun's
 * ordinary ESM handling then interops correctly.
 */
export const fixEs6PromisePoolInterop: BunPlugin = {
    name: "fix-es6-promise-pool-interop",
    setup(build) {
        // Resolved once, here, via Bun's own module resolution (not the bundler's plugin pipeline) to the
        // package's real absolute file path. Redirecting onResolve to that path, rather than requiring the
        // bare specifier again from inside onLoad's shim, avoids the shim's own require() being re-intercepted
        // by this same onResolve hook and redirected right back to itself.
        const realPath = require.resolve("es6-promise-pool");

        build.onResolve({ filter: /^es6-promise-pool$/ }, () => ({
            path: "es6-promise-pool",
            namespace: "fix-es6-promise-pool-interop",
        }));
        // A real ESM `export default` compiles through Bun's ordinary, well-worn code path — unlike the
        // `loader: "object"` shortcut, which turned out not to satisfy a *default* import's own interop here.
        build.onLoad({ filter: /.*/, namespace: "fix-es6-promise-pool-interop" }, () => ({
            contents: `const PromisePool = require(${JSON.stringify(realPath)});\nexport default PromisePool;\n`,
            loader: "js",
        }));
    },
};

export default fixEs6PromisePoolInterop;
