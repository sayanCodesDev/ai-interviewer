import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { config } from "../src/config/env";

// One pool per process. Size it so (instances x max) stays under the database's connection limit;
// with Neon, use the pooled (-pooler) connection string.
const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});
const prisma = new PrismaClient({ adapter });

export { prisma };
