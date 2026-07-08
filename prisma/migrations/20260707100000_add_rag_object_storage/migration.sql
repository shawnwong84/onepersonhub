ALTER TABLE "KnowledgeDocument"
ADD COLUMN "storageBucket" TEXT NOT NULL DEFAULT '',
ADD COLUMN "storageKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "storageUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "fileSize" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "KnowledgeDocument_storageKey_idx" ON "KnowledgeDocument"("storageKey");
