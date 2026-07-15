-- Multi-tenant migration: introduces "Company" as the tenant root and
-- scopes every other model to it via a plain "companyId" column (no Prisma-
-- level relation object - enforced by the FK constraints below and by the
-- tenant-scoping Prisma Client Extension at the application level).
--
-- Existing data becomes "Company #1" (fixed id below) so nothing is orphaned.

CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Company" ("id", "name", "updatedAt")
SELECT '00000000-0000-0000-0000-000000000001', COALESCE((SELECT "businessName" FROM "Settings" WHERE id = 'default'), 'Default Company'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Company" WHERE id = '00000000-0000-0000-0000-000000000001');

-- Admin
ALTER TABLE "Admin" ADD COLUMN "companyId" TEXT;
UPDATE "Admin" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Admin" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Admin_companyId_idx" ON "Admin"("companyId");
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Category
ALTER TABLE "Category" ADD COLUMN "companyId" TEXT;
UPDATE "Category" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Category_companyId_idx" ON "Category"("companyId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- KnowledgeEntry
ALTER TABLE "KnowledgeEntry" ADD COLUMN "companyId" TEXT;
UPDATE "KnowledgeEntry" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "KnowledgeEntry" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "KnowledgeEntry_companyId_idx" ON "KnowledgeEntry"("companyId");
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- KnowledgeDocument
ALTER TABLE "KnowledgeDocument" ADD COLUMN "companyId" TEXT;
UPDATE "KnowledgeDocument" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "KnowledgeDocument" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "KnowledgeDocument_companyId_idx" ON "KnowledgeDocument"("companyId");
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- KnowledgeIngestionRun
ALTER TABLE "KnowledgeIngestionRun" ADD COLUMN "companyId" TEXT;
UPDATE "KnowledgeIngestionRun" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "KnowledgeIngestionRun" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "KnowledgeIngestionRun_companyId_idx" ON "KnowledgeIngestionRun"("companyId");
ALTER TABLE "KnowledgeIngestionRun" ADD CONSTRAINT "KnowledgeIngestionRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- KnowledgeChunk
ALTER TABLE "KnowledgeChunk" ADD COLUMN "companyId" TEXT;
UPDATE "KnowledgeChunk" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "KnowledgeChunk_companyId_idx" ON "KnowledgeChunk"("companyId");
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- WebsiteSource
ALTER TABLE "WebsiteSource" ADD COLUMN "companyId" TEXT;
UPDATE "WebsiteSource" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "WebsiteSource" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "WebsiteSource_companyId_idx" ON "WebsiteSource"("companyId");
ALTER TABLE "WebsiteSource" ADD CONSTRAINT "WebsiteSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- TokenUsage
ALTER TABLE "TokenUsage" ADD COLUMN "companyId" TEXT;
UPDATE "TokenUsage" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "TokenUsage" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "TokenUsage_companyId_idx" ON "TokenUsage"("companyId");
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Department
ALTER TABLE "Department" ADD COLUMN "companyId" TEXT;
UPDATE "Department" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Department" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- RolePermission
ALTER TABLE "RolePermission" ADD COLUMN "companyId" TEXT;
UPDATE "RolePermission" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "RolePermission" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "RolePermission_companyId_idx" ON "RolePermission"("companyId");
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- TeamMember
ALTER TABLE "TeamMember" ADD COLUMN "companyId" TEXT;
UPDATE "TeamMember" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "TeamMember" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "TeamMember_companyId_idx" ON "TeamMember"("companyId");
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ReporterChatThread
ALTER TABLE "ReporterChatThread" ADD COLUMN "companyId" TEXT;
UPDATE "ReporterChatThread" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ReporterChatThread" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ReporterChatThread_companyId_idx" ON "ReporterChatThread"("companyId");
ALTER TABLE "ReporterChatThread" ADD CONSTRAINT "ReporterChatThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ReporterChatMessage
ALTER TABLE "ReporterChatMessage" ADD COLUMN "companyId" TEXT;
UPDATE "ReporterChatMessage" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ReporterChatMessage" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ReporterChatMessage_companyId_idx" ON "ReporterChatMessage"("companyId");
ALTER TABLE "ReporterChatMessage" ADD CONSTRAINT "ReporterChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ModuleAssignment
ALTER TABLE "ModuleAssignment" ADD COLUMN "companyId" TEXT;
UPDATE "ModuleAssignment" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ModuleAssignment" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ModuleAssignment_companyId_idx" ON "ModuleAssignment"("companyId");
ALTER TABLE "ModuleAssignment" ADD CONSTRAINT "ModuleAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Conversation
ALTER TABLE "Conversation" ADD COLUMN "companyId" TEXT;
UPDATE "Conversation" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Conversation" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Conversation_companyId_idx" ON "Conversation"("companyId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Message
ALTER TABLE "Message" ADD COLUMN "companyId" TEXT;
UPDATE "Message" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Message" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Message_companyId_idx" ON "Message"("companyId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Ticket
ALTER TABLE "Ticket" ADD COLUMN "companyId" TEXT;
UPDATE "Ticket" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Ticket_companyId_idx" ON "Ticket"("companyId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ConversationTag
ALTER TABLE "ConversationTag" ADD COLUMN "companyId" TEXT;
UPDATE "ConversationTag" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ConversationTag" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ConversationTag_companyId_idx" ON "ConversationTag"("companyId");
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- CallLog
ALTER TABLE "CallLog" ADD COLUMN "companyId" TEXT;
UPDATE "CallLog" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "CallLog" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "CallLog_companyId_idx" ON "CallLog"("companyId");
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Agent
ALTER TABLE "Agent" ADD COLUMN "companyId" TEXT;
UPDATE "Agent" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Agent" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Agent_companyId_idx" ON "Agent"("companyId");
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ChannelAccount
ALTER TABLE "ChannelAccount" ADD COLUMN "companyId" TEXT;
UPDATE "ChannelAccount" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ChannelAccount" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ChannelAccount_companyId_idx" ON "ChannelAccount"("companyId");
ALTER TABLE "ChannelAccount" ADD CONSTRAINT "ChannelAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- AgentChannelAccount
ALTER TABLE "AgentChannelAccount" ADD COLUMN "companyId" TEXT;
UPDATE "AgentChannelAccount" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "AgentChannelAccount" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "AgentChannelAccount_companyId_idx" ON "AgentChannelAccount"("companyId");
ALTER TABLE "AgentChannelAccount" ADD CONSTRAINT "AgentChannelAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- AgentKnowledgeScope
ALTER TABLE "AgentKnowledgeScope" ADD COLUMN "companyId" TEXT;
UPDATE "AgentKnowledgeScope" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "AgentKnowledgeScope" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "AgentKnowledgeScope_companyId_idx" ON "AgentKnowledgeScope"("companyId");
ALTER TABLE "AgentKnowledgeScope" ADD CONSTRAINT "AgentKnowledgeScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- AgentWorkflow
ALTER TABLE "AgentWorkflow" ADD COLUMN "companyId" TEXT;
UPDATE "AgentWorkflow" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "AgentWorkflow" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "AgentWorkflow_companyId_idx" ON "AgentWorkflow"("companyId");
ALTER TABLE "AgentWorkflow" ADD CONSTRAINT "AgentWorkflow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- AgentTool
ALTER TABLE "AgentTool" ADD COLUMN "companyId" TEXT;
UPDATE "AgentTool" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "AgentTool" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "AgentTool_companyId_idx" ON "AgentTool"("companyId");
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Schedule
ALTER TABLE "Schedule" ADD COLUMN "companyId" TEXT;
UPDATE "Schedule" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Schedule" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Schedule_companyId_idx" ON "Schedule"("companyId");
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Webhook
ALTER TABLE "Webhook" ADD COLUMN "companyId" TEXT;
UPDATE "Webhook" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Webhook" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Webhook_companyId_idx" ON "Webhook"("companyId");
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- WebhookDelivery
ALTER TABLE "WebhookDelivery" ADD COLUMN "companyId" TEXT;
UPDATE "WebhookDelivery" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "WebhookDelivery" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "WebhookDelivery_companyId_idx" ON "WebhookDelivery"("companyId");
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN "companyId" TEXT;
UPDATE "ActivityLog" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ActivityLog" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ActivityLog_companyId_idx" ON "ActivityLog"("companyId");
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Notification
ALTER TABLE "Notification" ADD COLUMN "companyId" TEXT;
UPDATE "Notification" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- SLARule
ALTER TABLE "SLARule" ADD COLUMN "companyId" TEXT;
UPDATE "SLARule" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "SLARule" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "SLARule_companyId_idx" ON "SLARule"("companyId");
ALTER TABLE "SLARule" ADD CONSTRAINT "SLARule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- CannedResponse
ALTER TABLE "CannedResponse" ADD COLUMN "companyId" TEXT;
UPDATE "CannedResponse" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "CannedResponse" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "CannedResponse_companyId_idx" ON "CannedResponse"("companyId");
ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Customer
ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT;
UPDATE "Customer" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- CustomerNote
ALTER TABLE "CustomerNote" ADD COLUMN "companyId" TEXT;
UPDATE "CustomerNote" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "CustomerNote" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "CustomerNote_companyId_idx" ON "CustomerNote"("companyId");
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- AutomationRule
ALTER TABLE "AutomationRule" ADD COLUMN "companyId" TEXT;
UPDATE "AutomationRule" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "AutomationRule" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "AutomationRule_companyId_idx" ON "AutomationRule"("companyId");
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "companyId" TEXT;
UPDATE "ApiKey" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- InternalNote
ALTER TABLE "InternalNote" ADD COLUMN "companyId" TEXT;
UPDATE "InternalNote" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "InternalNote" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "InternalNote_companyId_idx" ON "InternalNote"("companyId");
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Campaign
ALTER TABLE "Campaign" ADD COLUMN "companyId" TEXT;
UPDATE "Campaign" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Campaign" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Campaign_companyId_idx" ON "Campaign"("companyId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Flow
ALTER TABLE "Flow" ADD COLUMN "companyId" TEXT;
UPDATE "Flow" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Flow" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Flow_companyId_idx" ON "Flow"("companyId");
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN "companyId" TEXT;
UPDATE "WorkflowRun" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "WorkflowRun" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "WorkflowRun_companyId_idx" ON "WorkflowRun"("companyId");
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- WorkflowRunStep
ALTER TABLE "WorkflowRunStep" ADD COLUMN "companyId" TEXT;
UPDATE "WorkflowRunStep" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "WorkflowRunStep" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "WorkflowRunStep_companyId_idx" ON "WorkflowRunStep"("companyId");
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- WorkflowJob
ALTER TABLE "WorkflowJob" ADD COLUMN "companyId" TEXT;
UPDATE "WorkflowJob" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "WorkflowJob" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "WorkflowJob_companyId_idx" ON "WorkflowJob"("companyId");
ALTER TABLE "WorkflowJob" ADD CONSTRAINT "WorkflowJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ModuleRecord
ALTER TABLE "ModuleRecord" ADD COLUMN "companyId" TEXT;
UPDATE "ModuleRecord" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ModuleRecord" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ModuleRecord_companyId_idx" ON "ModuleRecord"("companyId");
ALTER TABLE "ModuleRecord" ADD CONSTRAINT "ModuleRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ModuleRecordEvent
ALTER TABLE "ModuleRecordEvent" ADD COLUMN "companyId" TEXT;
UPDATE "ModuleRecordEvent" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ModuleRecordEvent" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ModuleRecordEvent_companyId_idx" ON "ModuleRecordEvent"("companyId");
ALTER TABLE "ModuleRecordEvent" ADD CONSTRAINT "ModuleRecordEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ModuleSignal
ALTER TABLE "ModuleSignal" ADD COLUMN "companyId" TEXT;
UPDATE "ModuleSignal" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ModuleSignal" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ModuleSignal_companyId_idx" ON "ModuleSignal"("companyId");
ALTER TABLE "ModuleSignal" ADD CONSTRAINT "ModuleSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ConnectorOAuthState
ALTER TABLE "ConnectorOAuthState" ADD COLUMN "companyId" TEXT;
UPDATE "ConnectorOAuthState" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "ConnectorOAuthState" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "ConnectorOAuthState_companyId_idx" ON "ConnectorOAuthState"("companyId");
ALTER TABLE "ConnectorOAuthState" ADD CONSTRAINT "ConnectorOAuthState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- Role (unique constraint swap to per-company)
ALTER TABLE "Role" ADD COLUMN "companyId" TEXT;
UPDATE "Role" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Role" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Role_companyId_idx" ON "Role"("companyId");
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "Role_name_key";
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- Channel (unique constraint swap to per-company)
ALTER TABLE "Channel" ADD COLUMN "companyId" TEXT;
UPDATE "Channel" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Channel" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Channel_companyId_idx" ON "Channel"("companyId");
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "Channel_type_key";
CREATE UNIQUE INDEX "Channel_companyId_type_key" ON "Channel"("companyId", "type");

-- Tag (unique constraint swap to per-company)
ALTER TABLE "Tag" ADD COLUMN "companyId" TEXT;
UPDATE "Tag" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Tag" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Tag_companyId_idx" ON "Tag"("companyId");
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "Tag_name_key";
CREATE UNIQUE INDEX "Tag_companyId_name_key" ON "Tag"("companyId", "name");

-- BusinessModule (unique constraint swap to per-company)
ALTER TABLE "BusinessModule" ADD COLUMN "companyId" TEXT;
UPDATE "BusinessModule" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "BusinessModule" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "BusinessModule_companyId_idx" ON "BusinessModule"("companyId");
ALTER TABLE "BusinessModule" ADD CONSTRAINT "BusinessModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "BusinessModule_slug_key";
CREATE UNIQUE INDEX "BusinessModule_companyId_slug_key" ON "BusinessModule"("companyId", "slug");

-- Connector (unique constraint swap to per-company)
ALTER TABLE "Connector" ADD COLUMN "companyId" TEXT;
UPDATE "Connector" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE "companyId" IS NULL;
ALTER TABLE "Connector" ALTER COLUMN "companyId" SET NOT NULL;
CREATE INDEX "Connector_companyId_idx" ON "Connector"("companyId");
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
DROP INDEX "Connector_provider_name_key";
CREATE UNIQUE INDEX "Connector_companyId_provider_name_key" ON "Connector"("companyId", "provider", "name");

-- Settings (singleton "default" row -> per-company row, PK becomes companyId)
ALTER TABLE "Settings" ADD COLUMN "companyId" TEXT;
UPDATE "Settings" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE id = 'default';
-- Any deployment somehow without a "default" row yet gets one created fresh.
INSERT INTO "Settings" ("companyId", "updatedAt")
SELECT '00000000-0000-0000-0000-000000000001', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Settings" WHERE "companyId" = '00000000-0000-0000-0000-000000000001');
ALTER TABLE "Settings" DROP CONSTRAINT "Settings_pkey";
ALTER TABLE "Settings" DROP COLUMN "id";
ALTER TABLE "Settings" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_pkey" PRIMARY KEY ("companyId");
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- BusinessHours (singleton "default" row -> per-company row, PK becomes companyId)
ALTER TABLE "BusinessHours" ADD COLUMN "companyId" TEXT;
UPDATE "BusinessHours" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE id = 'default';
-- Any deployment somehow without a "default" row yet gets one created fresh.
INSERT INTO "BusinessHours" ("companyId")
SELECT '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM "BusinessHours" WHERE "companyId" = '00000000-0000-0000-0000-000000000001');
ALTER TABLE "BusinessHours" DROP CONSTRAINT "BusinessHours_pkey";
ALTER TABLE "BusinessHours" DROP COLUMN "id";
ALTER TABLE "BusinessHours" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("companyId");
ALTER TABLE "BusinessHours" ADD CONSTRAINT "BusinessHours_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- BillingAccount (singleton "default" row -> per-company row, PK becomes companyId)
ALTER TABLE "BillingAccount" ADD COLUMN "companyId" TEXT;
UPDATE "BillingAccount" SET "companyId" = '00000000-0000-0000-0000-000000000001' WHERE id = 'default';
-- Any deployment somehow without a "default" row yet gets one created fresh.
INSERT INTO "BillingAccount" ("companyId", "updatedAt")
SELECT '00000000-0000-0000-0000-000000000001', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BillingAccount" WHERE "companyId" = '00000000-0000-0000-0000-000000000001');
ALTER TABLE "BillingAccount" DROP CONSTRAINT "BillingAccount_pkey";
ALTER TABLE "BillingAccount" DROP COLUMN "id";
ALTER TABLE "BillingAccount" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("companyId");
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

