CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "flowId" TEXT,
    "flowName" TEXT NOT NULL DEFAULT '',
    "conversationId" TEXT,
    "triggerEvent" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "reason" TEXT NOT NULL DEFAULT '',
    "messagePreview" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL DEFAULT '',
    "nodeLabel" TEXT NOT NULL DEFAULT '',
    "nodeType" TEXT NOT NULL DEFAULT '',
    "actionType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRun_flowId_idx" ON "WorkflowRun"("flowId");
CREATE INDEX "WorkflowRun_conversationId_idx" ON "WorkflowRun"("conversationId");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");
CREATE INDEX "WorkflowRun_createdAt_idx" ON "WorkflowRun"("createdAt");
CREATE INDEX "WorkflowRunStep_runId_idx" ON "WorkflowRunStep"("runId");
CREATE INDEX "WorkflowRunStep_status_idx" ON "WorkflowRunStep"("status");
CREATE INDEX "WorkflowRunStep_nodeId_idx" ON "WorkflowRunStep"("nodeId");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
