-- Phase 9: RAG document ingestion, source chunks, website sources, and token usage.

CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'upload',
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "extractedText" TEXT NOT NULL DEFAULT '',
    "tableData" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeIngestionRun" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "logs" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT NOT NULL DEFAULT '',
    "extractedChars" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeIngestionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "knowledgeEntryId" TEXT,
    "content" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "pageNumber" INTEGER,
    "sheetName" TEXT NOT NULL DEFAULT '',
    "rowStart" INTEGER,
    "rowEnd" INTEGER,
    "sectionHeading" TEXT NOT NULL DEFAULT '',
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebsiteSource" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "url" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'single_url',
    "includePatterns" TEXT NOT NULL DEFAULT '',
    "excludePatterns" TEXT NOT NULL DEFAULT '',
    "crawlDepth" INTEGER NOT NULL DEFAULT 1,
    "schedule" TEXT NOT NULL DEFAULT 'manual',
    "lastStatus" TEXT NOT NULL DEFAULT 'never_run',
    "lastCrawledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "embeddingTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeDocument_categoryId_idx" ON "KnowledgeDocument"("categoryId");
CREATE INDEX "KnowledgeDocument_sourceType_idx" ON "KnowledgeDocument"("sourceType");
CREATE INDEX "KnowledgeDocument_status_idx" ON "KnowledgeDocument"("status");
CREATE INDEX "KnowledgeDocument_contentHash_idx" ON "KnowledgeDocument"("contentHash");
CREATE INDEX "KnowledgeDocument_createdAt_idx" ON "KnowledgeDocument"("createdAt");

CREATE INDEX "KnowledgeIngestionRun_documentId_idx" ON "KnowledgeIngestionRun"("documentId");
CREATE INDEX "KnowledgeIngestionRun_status_idx" ON "KnowledgeIngestionRun"("status");
CREATE INDEX "KnowledgeIngestionRun_stage_idx" ON "KnowledgeIngestionRun"("stage");
CREATE INDEX "KnowledgeIngestionRun_createdAt_idx" ON "KnowledgeIngestionRun"("createdAt");

CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
CREATE INDEX "KnowledgeChunk_knowledgeEntryId_idx" ON "KnowledgeChunk"("knowledgeEntryId");
CREATE INDEX "KnowledgeChunk_sourceUrl_idx" ON "KnowledgeChunk"("sourceUrl");

CREATE INDEX "WebsiteSource_categoryId_idx" ON "WebsiteSource"("categoryId");
CREATE INDEX "WebsiteSource_url_idx" ON "WebsiteSource"("url");
CREATE INDEX "WebsiteSource_lastStatus_idx" ON "WebsiteSource"("lastStatus");

CREATE INDEX "TokenUsage_feature_idx" ON "TokenUsage"("feature");
CREATE INDEX "TokenUsage_operation_idx" ON "TokenUsage"("operation");
CREATE INDEX "TokenUsage_entityType_entityId_idx" ON "TokenUsage"("entityType", "entityId");
CREATE INDEX "TokenUsage_createdAt_idx" ON "TokenUsage"("createdAt");

ALTER TABLE "KnowledgeIngestionRun" ADD CONSTRAINT "KnowledgeIngestionRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_knowledgeEntryId_fkey" FOREIGN KEY ("knowledgeEntryId") REFERENCES "KnowledgeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
