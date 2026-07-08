import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function backfillPendingApprovalNotifications() {
  const conversations = await prisma.conversation.findMany({
    select: { id: true, metadata: true },
  });

  for (const conversation of conversations) {
    const metadata = asMetadata(conversation.metadata);
    const approval = asMetadata(metadata.pendingWorkflowApproval);
    const approvalId = typeof approval.id === "string" ? approval.id : "";

    if (!approvalId || approval.status !== "pending") continue;

    const existingDecision = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        role: "system",
      },
      orderBy: { createdAt: "desc" },
    });
    const decisionMetadata = existingDecision
      ? asMetadata(existingDecision.toolCalls)
      : {};

    if (
      decisionMetadata.source === "workflow_approval_decision" &&
      decisionMetadata.approvalId === approvalId
    ) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...metadata,
            pendingWorkflowApproval: null,
            lastWorkflowApproval: {
              ...approval,
              status: decisionMetadata.decision || "resolved",
              decidedAt: existingDecision!.createdAt.toISOString(),
              decidedByName: decisionMetadata.decidedByName || "Unknown",
            },
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      continue;
    }

    const existingNotification = await prisma.notification.findFirst({
      where: {
        type: "workflow_approval_required",
        conversationId: conversation.id,
        readAt: null,
      },
    });

    if (existingNotification) continue;

    await createNotification({
      type: "workflow_approval_required",
      title: "Workflow approval required",
      message: `${String(approval.flowName || "Workflow")}: ${String(
        approval.title || "Approve next workflow step"
      )}`,
      priority: "high",
      href: `/conversations?conversationId=${conversation.id}`,
      conversationId: conversation.id,
      metadata: {
        flowId: approval.flowId,
        flowName: approval.flowName,
        approvalId,
        approvalNodeId: approval.approvalNodeId,
        nextNodeId: approval.nextNodeId,
        proposedAction: approval.proposedAction,
        backfilled: true,
      },
    });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    backfillPendingApprovalNotifications().catch((error) => {
      logger.error("Failed to backfill approval notifications:", error);
    });

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const requestedLimit = Number(searchParams.get("limit") || 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 20;

    const where = unreadOnly ? { readAt: null } : {};

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({ where: { readAt: null } }),
    ]);

    return NextResponse.json({ items, unreadCount });
  } catch (error) {
    logger.error("Failed to fetch notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const markAllRead = body.markAllRead === true;
    const id = typeof body.id === "string" ? body.id : "";

    if (markAllRead) {
      await prisma.notification.updateMany({
        where: { readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    if (!id) {
      return NextResponse.json(
        { error: "Notification id is required" },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        readAt:
          body.read === false
            ? null
            : new Date(),
        ...(body.metadata && typeof body.metadata === "object"
          ? { metadata: body.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    return NextResponse.json(notification);
  } catch (error) {
    logger.error("Failed to update notification:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}
