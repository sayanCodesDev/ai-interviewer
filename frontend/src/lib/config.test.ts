import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { BACKEND_URL } from "./config";

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
    });
}

describe("build-time settings", () => {
    test("without a build, the API address falls back to the local default instead of crashing", () => {
        expect(BACKEND_URL).toBe("http://localhost:2000");
    });

    // `import.meta.env` does not exist in a browser. The dev server crashes on `import.meta.env.X` at load (the whole app
    // goes blank) and a production bundle that guards it silently ignores the setting (every deployed build talked to
    // localhost). Settings come from the globals in globals.d.ts instead.
    test("no source file reads import.meta.env", () => {
        const offenders = sourceFiles(join(import.meta.dir, "..")).filter((file) => readFileSync(file, "utf8").replace(/\/\/.*$/gm, "").includes("import.meta.env"));
        expect(offenders).toEqual([]);
    });
});
