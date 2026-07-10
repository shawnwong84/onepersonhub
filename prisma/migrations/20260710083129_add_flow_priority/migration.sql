-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- Backfill: give existing rows distinct sequential priorities based on
-- their current creation order, rather than leaving them all at the 0
-- default. Without this, every pre-existing flow shares the same priority
-- and the UI's swap-with-neighbor reorder (which swaps two flows'
-- priority values) is a no-op the first time it's used.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "Flow"
)
UPDATE "Flow"
SET "priority" = ordered.rn
FROM ordered
WHERE "Flow"."id" = ordered."id";
