import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asJsonObject(value: unknown): Prisma.InputJsonValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonValue)
    : {};
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asToolList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      toolType: asString(item.toolType),
      toolName: asString(item.toolName),
      isEnabled: asBoolean(item.isEnabled, true),
      requiresApproval: asBoolean(item.requiresApproval, false),
      config: asJsonObject(item.config),
    }))
    .filter((item) => item.toolType && item.toolName);
}

const agentInclude = {
  escalationDepartment: {
    select: { id: true, name: true },
  },
  channelAccounts: {
    include: {
      channelAccount: {
        select: {
          id: true,
          channel: true,
          name: true,
          identifier: true,
          status: true,
          isActive: true,
        },
      },
    },
    orderBy: { priority: "asc" as const },
  },
  knowledgeScopes: {
    include: {
      category: { select: { id: true, name: true } },
      entry: { select: { id: true, title: true } },
      document: { select: { id: true, title: true, fileName: true } },
    },
  },
  workflows: {
    include: {
      flow: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: { priority: "asc" as const },
  },
  tools: {
    orderBy: { toolName: "asc" as const },
  },
  _count: {
    select: {
      channelAccounts: true,
      knowledgeScopes: true,
      workflows: true,
      tools: true,
      conversations: true,
    },
  },
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "agents:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: agentInclude,
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error) {
    logger.error("Failed to fetch agent:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "agents:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const name = asString(body.name);

    if (!name) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    const channelAccountIds = asStringArray(body.channelAccountIds);
    const categoryIds = asStringArray(body.categoryIds);
    const entryIds = asStringArray(body.entryIds);
    const documentIds = asStringArray(body.documentIds);
    const flowIds = asStringArray(body.flowIds);
    const tools = asToolList(body.tools);

    const agent = await prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id },
        data: {
          name,
          description: asString(body.description),
          status: asString(body.status, "active") || "active",
          tone: asString(body.tone, "friendly") || "friendly",
          language: asString(body.language, "auto") || "auto",
          systemPrompt: asString(body.systemPrompt),
          fallbackMode: asString(body.fallbackMode, "ai_reply") || "ai_reply",
          automationMode:
            asString(body.automationMode, "workflow_first") || "workflow_first",
          requireApproval: asBoolean(body.requireApproval, false),
          useGlobalKnowledge: asBoolean(body.useGlobalKnowledge, true),
          escalationDepartmentId: asString(body.escalationDepartmentId) || null,
          metadata: asJsonObject(body.metadata),
        },
      });

      await Promise.all([
        tx.agentChannelAccount.deleteMany({ where: { agentId: id } }),
        tx.agentKnowledgeScope.deleteMany({ where: { agentId: id } }),
        tx.agentWorkflow.deleteMany({ where: { agentId: id } }),
        tx.agentTool.deleteMany({ where: { agentId: id } }),
      ]);

      if (channelAccountIds.length) {
        await tx.agentChannelAccount.createMany({
          data: channelAccountIds.map((channelAccountId, index) => ({
            agentId: id,
            channelAccountId,
            isPrimary: index === 0,
            priority: (index + 1) * 10,
          })),
        });
      }

      const scopeRows = [
        ...categoryIds.map((categoryId) => ({ agentId: id, categoryId })),
        ...entryIds.map((entryId) => ({ agentId: id, entryId })),
        ...documentIds.map((documentId) => ({ agentId: id, documentId })),
      ];
      if (scopeRows.length) {
        await tx.agentKnowledgeScope.createMany({ data: scopeRows });
      }

      if (flowIds.length) {
        await tx.agentWorkflow.createMany({
          data: flowIds.map((flowId, index) => ({
            agentId: id,
            flowId,
            priority: (index + 1) * 10,
          })),
        });
      }

      if (tools.length) {
        await tx.agentTool.createMany({
          data: tools.map((tool) => ({
            agentId: id,
            ...tool,
          })),
        });
      }

      return tx.agent.findUniqueOrThrow({
        where: { id },
        include: agentInclude,
      });
    });

    await logActivity({
      action: "agent.updated",
      entity: ACTIVITY_ENTITIES.AGENT,
      entityId: agent.id,
      description: `${auth.name || auth.username} updated agent: ${agent.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        channelAccountCount: channelAccountIds.length,
        workflowCount: flowIds.length,
        knowledgeScopeCount: categoryIds.length + entryIds.length + documentIds.length,
        toolCount: tools.length,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(agent);
  } catch (error) {
    logger.error("Failed to update agent:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "agents:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const existing = await prisma.agent.findUnique({ where: { id }, select: { name: true } });
    await prisma.agent.delete({ where: { id } });
    await logActivity({
      action: "agent.deleted",
      entity: ACTIVITY_ENTITIES.AGENT,
      entityId: id,
      description: `${auth.name || auth.username} deleted agent: ${existing?.name || id}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { agentName: existing?.name || "" },
      ...getActivityRequestContext(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete agent:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
