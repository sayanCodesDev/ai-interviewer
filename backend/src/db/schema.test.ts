import "../testing/setup";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { prisma } from "../../lib/prisma";
import { checkSchema, localMigrations, missingMigrations, schemaHelp } from "./schema";

after(() => prisma.$disconnect());

describe("database schema guard", () => {
    test("names exactly the migrations the database hasn't applied", () => {
        assert.deepEqual(missingMigrations(["001_a", "002_b", "003_c"], ["001_a", "003_c"]), ["002_b"]);
        assert.deepEqual(missingMigrations(["001_a"], []), ["001_a"]);
        assert.deepEqual(missingMigrations(["001_a"], ["001_a", "999_from_a_newer_version"]), [], "a database ahead of this code is fine");
    });

    test("the test database (migrated by pretest) is up to date with this code", async () => {
        const status = await checkSchema();
        assert.deepEqual(status, { ok: true, skipped: false, missing: [] });
        assert.ok((localMigrations() ?? []).length >= 3);
    });

    test("a migration the database doesn't have is reported, with the command that fixes it", async () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), "migrations-"));
        try {
            for (const name of [...(localMigrations() ?? []), "29990101000000_not_applied_yet"]) mkdirSync(path.join(dir, name));
            const status = await checkSchema(dir);
            assert.equal(status.ok, false);
            assert.deepEqual(status.missing, ["29990101000000_not_applied_yet"]);
            assert.match(schemaHelp(status.missing), /npm run db:migrate:deploy/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test("when the migration files aren't deployed the check is skipped rather than failing the server", async () => {
        const status = await checkSchema(path.join(os.tmpdir(), "definitely-not-a-migrations-folder"));
        assert.deepEqual(status, { ok: true, skipped: true, missing: [] });
    });
});
