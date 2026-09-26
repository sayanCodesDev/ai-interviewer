import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../lib/prisma";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prisma/migrations");

/** Migration folder names shipped with this code, oldest first. Null when the folder isn't deployed alongside it. */
export function localMigrations(dir = MIGRATIONS_DIR): string[] | null {
    if (!existsSync(dir)) return null;
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

/** The migrations this code expects that the database has not applied. */
export function missingMigrations(local: readonly string[], applied: Iterable<string>): string[] {
    const done = new Set(applied);
    return local.filter((name) => !done.has(name));
}

/** What the database says it has applied. A database that has never been migrated has no history table at all. */
async function appliedMigrations(): Promise<Set<string>> {
    try {
        const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
            SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
        return new Set(rows.map((row) => row.migration_name));
    } catch (error) {
        if (/_prisma_migrations|relation .* does not exist|42P01/i.test(String((error as Error)?.message ?? error))) return new Set();
        throw error;
    }
}

export interface SchemaStatus {
    ok: boolean;
    /** True when the migration files aren't available to compare against, so nothing was checked. */
    skipped: boolean;
    missing: string[];
}

/**
 * Whether the database has every migration this version of the code was written for. Running new code
 * against an old schema fails deep inside a request with a cryptic "table does not exist"; checking at
 * boot (and in /readyz) turns that into one clear instruction.
 */
export async function checkSchema(dir = MIGRATIONS_DIR): Promise<SchemaStatus> {
    const local = localMigrations(dir);
    if (!local) return { ok: true, skipped: true, missing: [] };
    const missing = missingMigrations(local, await appliedMigrations());
    return { ok: missing.length === 0, skipped: false, missing };
}

export function schemaHelp(missing: string[]): string {
    return `The database is missing ${missing.length} migration${missing.length === 1 ? "" : "s"} (${missing.join(", ")}). Run "npm run db:migrate:deploy" in backend/ (it only adds what is missing and never resets anything), then start the server again.`;
}

let knownGood = false;

/** For /readyz: once the schema is confirmed it can only move forward, so only failures are re-checked. */
export async function schemaReady(): Promise<SchemaStatus> {
    if (knownGood) return { ok: true, skipped: false, missing: [] };
    const status = await checkSchema();
    if (status.ok) knownGood = true;
    return status;
}
