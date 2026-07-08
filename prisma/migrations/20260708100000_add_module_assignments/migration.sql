-- Module assignments: which members can access which business modules
CREATE TABLE "ModuleAssignment" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "moduleSlug" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'read',
    "assignedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleAssignment_teamMemberId_moduleSlug_key" ON "ModuleAssignment"("teamMemberId", "moduleSlug");
CREATE INDEX "ModuleAssignment_teamMemberId_idx" ON "ModuleAssignment"("teamMemberId");
CREATE INDEX "ModuleAssignment_moduleSlug_idx" ON "ModuleAssignment"("moduleSlug");

ALTER TABLE "ModuleAssignment" ADD CONSTRAINT "ModuleAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Formalize conversation assignment as a real column
ALTER TABLE "Conversation" ADD COLUMN "assignedToId" TEXT;
CREATE INDEX "Conversation_assignedToId_idx" ON "Conversation"("assignedToId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from existing metadata assignments
UPDATE "Conversation" c
SET "assignedToId" = (c.metadata->>'assignedToId')
WHERE c.metadata->>'assignedToId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "TeamMember" t WHERE t.id = c.metadata->>'assignedToId');
