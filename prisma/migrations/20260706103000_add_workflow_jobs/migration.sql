CREATE TABLE "WorkflowJob" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowName" TEXT NOT NULL DEFAULT '',
    "conversationId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "customerId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "nextNodeId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "runId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowJob_status_dueAt_idx" ON "WorkflowJob"("status", "dueAt");
CREATE INDEX "WorkflowJob_flowId_idx" ON "WorkflowJob"("flowId");
CREATE INDEX "WorkflowJob_conversationId_idx" ON "WorkflowJob"("conversationId");
