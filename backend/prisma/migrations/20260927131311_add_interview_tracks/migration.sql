-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "continuesFromId" TEXT,
ADD COLUMN     "continuesTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trackId" TEXT,
ADD COLUMN     "trackPosition" INTEGER NOT NULL DEFAULT 1;

-- Backfill: every existing interview starts as its own, standalone track.
UPDATE "Interview" SET "trackId" = "id" WHERE "trackId" IS NULL;

ALTER TABLE "Interview" ALTER COLUMN "trackId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Interview_trackId_trackPosition_idx" ON "Interview"("trackId", "trackPosition");
