import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { agentInputSchema, validateBody } from "@/lib/validations";

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

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "agents:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        include: agentInclude,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip,
        take,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(agents, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "agents:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const name = asString(body.name);

    const validation = validateBody(agentInputSchema, {
      name,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.tone !== undefined && { tone: body.tone }),
      ...(body.fallbackMode !== undefined && { fallbackMode: body.fallbackMode }),
      ...(body.automationMode !== undefined && { automationMode: body.automationMode }),
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const categoryIds = asStringArray(body.categoryIds);
    const entryIds = asStringArray(body.entryIds);
    const documentIds = asStringArray(body.documentIds);
    const flowIds = asStringArray(body.flowIds);
    const tools = asToolList(body.tools);

    const agent = await prisma.$transaction(async (tx) => {
      const created = await tx.agent.create({
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

      const scopeRows = [
        ...categoryIds.map((categoryId) => ({ agentId: created.id, categoryId })),
        ...entryIds.map((entryId) => ({ agentId: created.id, entryId })),
        ...documentIds.map((documentId) => ({ agentId: created.id, documentId })),
      ];
      if (scopeRows.length) {
        await tx.agentKnowledgeScope.createMany({ data: scopeRows });
      }

      if (flowIds.length) {
        await tx.agentWorkflow.createMany({
          data: flowIds.map((flowId, index) => ({
            agentId: created.id,
            flowId,
            priority: (index + 1) * 10,
          })),
        });
      }

      if (tools.length) {
        await tx.agentTool.createMany({
          data: tools.map((tool) => ({
            agentId: created.id,
            ...tool,
          })),
        });
      }

      return tx.agent.findUniqueOrThrow({
        where: { id: created.id },
        include: agentInclude,
      });
    });

    await logActivity({
      action: "agent.created",
      entity: ACTIVITY_ENTITIES.AGENT,
      entityId: agent.id,
      description: `${auth.name || auth.username} created agent: ${agent.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        workflowCount: flowIds.length,
        knowledgeScopeCount: categoryIds.length + entryIds.length + documentIds.length,
        toolCount: tools.length,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    logger.error("Failed to create agent:", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
