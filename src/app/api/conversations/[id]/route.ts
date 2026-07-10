import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isUnscoped } from "@/lib/rbac-scope";
import { emitConversationUpdate } from "@/lib/realtime";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        customer: true,
        agent: {
          select: { id: true, name: true },
        },
        channelAccount: {
          select: { id: true, name: true, identifier: true },
        },
        tags: {
          include: { tag: true },
        },
        tickets: {
          include: {
            department: true,
            assignedTo: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (!isUnscoped(auth) && conversation.assignedToId !== auth.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This conversation is not assigned to you." } },
        { status: 403 }
      );
    }

    return NextResponse.json(conversation);
  } catch (error) {
    logger.error("Failed to fetch conversation:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, customerName, customerContact, summary, satisfaction, tagIds, agentId } = body;

    if (agentId !== undefined && agentId !== null && typeof agentId === "string" && agentId) {
      const agentExists = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
      if (!agentExists) {
        return NextResponse.json({ error: "Agent not found" }, { status: 400 });
      }
    }

    const validStatuses = ["active", "resolved", "closed", "escalated", "snoozed"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    if (satisfaction !== undefined && satisfaction !== null) {
      if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
        return NextResponse.json(
          { error: "Satisfaction must be an integer between 1 and 5" },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (!isUnscoped(auth) && existing.assignedToId !== auth.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This conversation is not assigned to you." } },
        { status: 403 }
      );
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(customerName !== undefined && { customerName: customerName.trim() }),
        ...(customerContact !== undefined && { customerContact: customerContact.trim() }),
        ...(summary !== undefined && { summary: summary.trim() }),
        ...(satisfaction !== undefined && { satisfaction }),
        ...(agentId !== undefined && { agentId: agentId || null }),
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        agent: {
          select: { id: true, name: true },
        },
        channelAccount: {
          select: { id: true, name: true, identifier: true },
        },
        tags: {
          include: { tag: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    const changes: Record<string, { from: string | number | null; to: string | number | null }> = {};
    if (status !== undefined && status !== existing.status) {
      changes.status = { from: existing.status, to: status };
    }
    if (customerName !== undefined && customerName.trim() !== existing.customerName) {
      changes.customerName = { from: existing.customerName, to: customerName.trim() };
    }
    if (customerContact !== undefined && customerContact.trim() !== existing.customerContact) {
      changes.customerContact = { from: existing.customerContact, to: customerContact.trim() };
    }
    if (satisfaction !== undefined && satisfaction !== existing.satisfaction) {
      changes.satisfaction = { from: existing.satisfaction, to: satisfaction };
    }
    if (agentId !== undefined && (agentId || null) !== existing.agentId) {
      changes.agentId = { from: existing.agentId, to: agentId || null };
    }

    if (Object.keys(changes).length > 0) {
      await logActivity({
        action: status !== undefined && status !== existing.status
          ? "conversation.status_changed"
          : "conversation.updated",
        entity: ACTIVITY_ENTITIES.CONVERSATION,
        entityId: id,
        description: status !== undefined && status !== existing.status
          ? `Conversation status changed from ${existing.status} to ${status}.`
          : `Conversation updated for ${conversation.customerName}.`,
        userId: auth.userId,
        userName: auth.name || auth.username,
        metadata: {
          changes,
          channel: conversation.channel,
          customerName: conversation.customerName,
        },
        ...getActivityRequestContext(request),
      });
    }

    if (tagIds && Array.isArray(tagIds)) {
      await prisma.conversationTag.deleteMany({
        where: { conversationId: id },
      });

      if (tagIds.length > 0) {
        await prisma.conversationTag.createMany({
          data: tagIds.map((tagId: string) => ({
            conversationId: id,
            tagId,
          })),
        });
      }

      await logActivity({
        action: "conversation.tags_updated",
        entity: ACTIVITY_ENTITIES.CONVERSATION,
        entityId: id,
        description: `Updated tags for conversation with ${conversation.customerName}.`,
        userId: auth.userId,
        userName: auth.name || auth.username,
        metadata: {
          tagIds,
          channel: conversation.channel,
        },
        ...getActivityRequestContext(request),
      });

      const updated = await prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          tags: { include: { tag: true } },
          _count: { select: { messages: true } },
        },
      });

      return NextResponse.json(updated);
    }

    emitConversationUpdate(id, { status, customerName });

    return NextResponse.json(conversation);
  } catch (error) {
    logger.error("Failed to update conversation:", error);
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    await prisma.conversation.delete({ where: { id } });

    await logActivity({
      action: "conversation.deleted",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: existing.id,
      description: `Deleted ${existing.channel} conversation for ${existing.customerName}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        channel: existing.channel,
        customerName: existing.customerName,
        customerContact: existing.customerContact,
        status: existing.status,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
