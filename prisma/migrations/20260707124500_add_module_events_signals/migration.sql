-- Module record event trail and Reporter Agent attention signals.

ALTER TABLE "ModuleRecord" ADD COLUMN "sourceMessageId" TEXT;

CREATE TABLE "ModuleRecordEvent" (
    "id" TEXT NOT NULL,
    "moduleRecordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleRecordEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleSignal" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "moduleRecordId" TEXT,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModuleRecord_sourceMessageId_idx" ON "ModuleRecord"("sourceMessageId");
CREATE INDEX "ModuleRecordEvent_moduleRecordId_idx" ON "ModuleRecordEvent"("moduleRecordId");
CREATE INDEX "ModuleRecordEvent_action_idx" ON "ModuleRecordEvent"("action");
CREATE INDEX "ModuleRecordEvent_createdAt_idx" ON "ModuleRecordEvent"("createdAt");
CREATE INDEX "ModuleSignal_moduleId_idx" ON "ModuleSignal"("moduleId");
CREATE INDEX "ModuleSignal_moduleRecordId_idx" ON "ModuleSignal"("moduleRecordId");
CREATE INDEX "ModuleSignal_signalType_idx" ON "ModuleSignal"("signalType");
CREATE INDEX "ModuleSignal_severity_idx" ON "ModuleSignal"("severity");
CREATE INDEX "ModuleSignal_status_idx" ON "ModuleSignal"("status");
CREATE INDEX "ModuleSignal_createdAt_idx" ON "ModuleSignal"("createdAt");

ALTER TABLE "ModuleRecordEvent" ADD CONSTRAINT "ModuleRecordEvent_moduleRecordId_fkey" FOREIGN KEY ("moduleRecordId") REFERENCES "ModuleRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleSignal" ADD CONSTRAINT "ModuleSignal_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "BusinessModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleSignal" ADD CONSTRAINT "ModuleSignal_moduleRecordId_fkey" FOREIGN KEY ("moduleRecordId") REFERENCES "ModuleRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
