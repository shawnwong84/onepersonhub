-- Agent capability routing, channel accounts, scoped KB, and workflow assignment.

CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "fallbackMode" TEXT NOT NULL DEFAULT 'ai_reply',
    "automationMode" TEXT NOT NULL DEFAULT 'workflow_first',
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "useGlobalKnowledge" BOOLEAN NOT NULL DEFAULT true,
    "escalationDepartmentId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAccount" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "automationMode" TEXT NOT NULL DEFAULT 'workflow_first',
    "defaultAgentId" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentChannelAccount" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "routingRules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChannelAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentKnowledgeScope" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "categoryId" TEXT,
    "entryId" TEXT,
    "documentId" TEXT,
    "scopeType" TEXT NOT NULL DEFAULT 'include',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentKnowledgeScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentWorkflow" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolType" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation" ADD COLUMN "agentId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "channelAccountId" TEXT;

CREATE UNIQUE INDEX "ChannelAccount_channel_identifier_key" ON "ChannelAccount"("channel", "identifier");
CREATE UNIQUE INDEX "AgentChannelAccount_agentId_channelAccountId_key" ON "AgentChannelAccount"("agentId", "channelAccountId");
CREATE UNIQUE INDEX "AgentWorkflow_agentId_flowId_key" ON "AgentWorkflow"("agentId", "flowId");
CREATE UNIQUE INDEX "AgentTool_agentId_toolType_toolName_key" ON "AgentTool"("agentId", "toolType", "toolName");

CREATE INDEX "Agent_status_idx" ON "Agent"("status");
CREATE INDEX "Agent_escalationDepartmentId_idx" ON "Agent"("escalationDepartmentId");
CREATE INDEX "ChannelAccount_channel_idx" ON "ChannelAccount"("channel");
CREATE INDEX "ChannelAccount_identifier_idx" ON "ChannelAccount"("identifier");
CREATE INDEX "ChannelAccount_defaultAgentId_idx" ON "ChannelAccount"("defaultAgentId");
CREATE INDEX "ChannelAccount_status_idx" ON "ChannelAccount"("status");
CREATE INDEX "AgentChannelAccount_agentId_idx" ON "AgentChannelAccount"("agentId");
CREATE INDEX "AgentChannelAccount_channelAccountId_idx" ON "AgentChannelAccount"("channelAccountId");
CREATE INDEX "AgentChannelAccount_priority_idx" ON "AgentChannelAccount"("priority");
CREATE INDEX "AgentKnowledgeScope_agentId_idx" ON "AgentKnowledgeScope"("agentId");
CREATE INDEX "AgentKnowledgeScope_categoryId_idx" ON "AgentKnowledgeScope"("categoryId");
CREATE INDEX "AgentKnowledgeScope_entryId_idx" ON "AgentKnowledgeScope"("entryId");
CREATE INDEX "AgentKnowledgeScope_documentId_idx" ON "AgentKnowledgeScope"("documentId");
CREATE INDEX "AgentWorkflow_agentId_idx" ON "AgentWorkflow"("agentId");
CREATE INDEX "AgentWorkflow_flowId_idx" ON "AgentWorkflow"("flowId");
CREATE INDEX "AgentWorkflow_priority_idx" ON "AgentWorkflow"("priority");
CREATE INDEX "AgentTool_agentId_idx" ON "AgentTool"("agentId");
CREATE INDEX "AgentTool_toolType_idx" ON "AgentTool"("toolType");
CREATE INDEX "Conversation_agentId_idx" ON "Conversation"("agentId");
CREATE INDEX "Conversation_channelAccountId_idx" ON "Conversation"("channelAccountId");

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_escalationDepartmentId_fkey" FOREIGN KEY ("escalationDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelAccount" ADD CONSTRAINT "ChannelAccount_defaultAgentId_fkey" FOREIGN KEY ("defaultAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentChannelAccount" ADD CONSTRAINT "AgentChannelAccount_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentChannelAccount" ADD CONSTRAINT "AgentChannelAccount_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledgeScope" ADD CONSTRAINT "AgentKnowledgeScope_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledgeScope" ADD CONSTRAINT "AgentKnowledgeScope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledgeScope" ADD CONSTRAINT "AgentKnowledgeScope_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "KnowledgeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentKnowledgeScope" ADD CONSTRAINT "AgentKnowledgeScope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentWorkflow" ADD CONSTRAINT "AgentWorkflow_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentWorkflow" ADD CONSTRAINT "AgentWorkflow_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
