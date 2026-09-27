import { prisma } from "../../lib/prisma";

/** Empties every table between tests. Cascades from User cover the interview tables too. */
export async function resetDatabase(): Promise<void> {
    await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "Report", "CodeSubmission", "InterviewTurn", "Interview", "RefreshSession", "User" RESTART IDENTITY CASCADE',
    );
}
