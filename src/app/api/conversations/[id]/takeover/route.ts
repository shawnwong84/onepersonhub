import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { emitConversationUpdate } from "@/lib/realtime";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled !== false;

    const existing = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, metadata: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const currentMetadata = asMetadata(existing.metadata);
    const metadata: Record<string, unknown> = enabled
      ? {
          ...currentMetadata,
          humanTakeover: true,
          automationPaused: true,
          pendingWorkflowApproval: null,
          takeoverById: auth.userId,
          takeoverByName: auth.name || auth.username,
          takeoverAt: new Date().toISOString(),
        }
      : {
          ...currentMetadata,
          humanTakeover: false,
          automationPaused: false,
          releasedById: auth.userId,
          releasedByName: auth.name || auth.username,
          releasedAt: new Date().toISOString(),
        };

    if (enabled) {
      await prisma.workflowJob.updateMany({
        where: {
          conversationId: id,
          status: "pending",
        },
        data: {
          status: "canceled",
          completedAt: new Date(),
          lastError: "Canceled because human takeover started",
        },
      });
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { metadata: metadata as Prisma.InputJsonValue },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        customer: true,
        tags: { include: { tag: true } },
        tickets: {
          include: {
            department: true,
            assignedTo: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });

    emitConversationUpdate(id, {
      humanTakeover: metadata.humanTakeover,
      automationPaused: metadata.automationPaused,
      takeoverByName: metadata.takeoverByName || null,
    });

    await logActivity({
      action: enabled ? "conversation.human_takeover_started" : "conversation.automation_resumed",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: id,
      description: enabled
        ? `Human takeover started for ${conversation.customerName}.`
        : `Automation resumed for ${conversation.customerName}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        enabled,
        channel: conversation.channel,
        customerName: conversation.customerName,
        canceledWorkflowJobs: enabled ? true : false,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(conversation);
  } catch (error) {
    logger.error("Failed to update conversation takeover:", error);
    return NextResponse.json(
      { error: "Failed to update conversation takeover" },
      { status: 500 }
    );
  }
}
