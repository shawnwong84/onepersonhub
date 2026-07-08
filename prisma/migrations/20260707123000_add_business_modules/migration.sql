-- Business module marketplace persistence and flexible module records.

CREATE TABLE "BusinessModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "isInstalled" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "installedAt" TIMESTAMP(3),
    "installedBy" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleRecord" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "sourceChannel" TEXT NOT NULL DEFAULT '',
    "sourceMessage" TEXT NOT NULL DEFAULT '',
    "conversationId" TEXT,
    "customerId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "reporterState" TEXT NOT NULL DEFAULT 'normal',
    "reporterNotes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessModule_slug_key" ON "BusinessModule"("slug");
CREATE INDEX "BusinessModule_category_idx" ON "BusinessModule"("category");
CREATE INDEX "BusinessModule_isInstalled_isEnabled_idx" ON "BusinessModule"("isInstalled", "isEnabled");
CREATE INDEX "ModuleRecord_moduleId_idx" ON "ModuleRecord"("moduleId");
CREATE INDEX "ModuleRecord_recordType_idx" ON "ModuleRecord"("recordType");
CREATE INDEX "ModuleRecord_status_idx" ON "ModuleRecord"("status");
CREATE INDEX "ModuleRecord_priority_idx" ON "ModuleRecord"("priority");
CREATE INDEX "ModuleRecord_reporterState_idx" ON "ModuleRecord"("reporterState");
CREATE INDEX "ModuleRecord_conversationId_idx" ON "ModuleRecord"("conversationId");
CREATE INDEX "ModuleRecord_customerId_idx" ON "ModuleRecord"("customerId");

ALTER TABLE "ModuleRecord" ADD CONSTRAINT "ModuleRecord_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "BusinessModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
