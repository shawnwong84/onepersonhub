-- Conversation list defaults to orderBy updatedAt desc with no matching index.
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- Module records queries always filter by moduleId and sort updatedAt desc.
CREATE INDEX "ModuleRecord_moduleId_updatedAt_idx" ON "ModuleRecord"("moduleId", "updatedAt");
