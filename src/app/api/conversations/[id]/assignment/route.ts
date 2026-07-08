import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { emitConversationUpdate, emitNewMessage } from "@/lib/realtime";
import { logger } from "@/lib/logger";

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
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
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:assign");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const memberId = typeof body.memberId === "string" ? body.memberId : "";

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, metadata: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const metadata = asMetadata(conversation.metadata);

    if (!memberId) {
      const nextMetadata = {
        ...metadata,
        assignedToId: null,
        assignedToName: null,
        assignedDepartmentId: null,
        assignedDepartmentName: null,
        assignedAt: null,
        assignedBy: null,
      };

      await prisma.conversation.update({
        where: { id },
        data: {
          assignedToId: null,
          metadata: nextMetadata as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      await prisma.ticket.updateMany({
        where: {
          conversationId: id,
          status: { in: ["open", "in_progress"] },
        },
        data: { assignedToId: null },
      });

      const systemMessage = await prisma.message.create({
        data: {
          conversationId: id,
          role: "system",
          content: `Conversation unassigned by ${auth.name || auth.username}`,
          toolCalls: {
            source: "manual_assignment",
            decision: "unassign",
            decidedByName: auth.name || auth.username,
          },
        },
      });

      emitNewMessage(id, {
        id: systemMessage.id,
        role: systemMessage.role,
        content: systemMessage.content,
      });
      emitConversationUpdate(id, { assignedToId: null });

      return NextResponse.json(await getConversation(id));
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { department: true },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    const nextMetadata = {
      ...metadata,
      assignedToId: member.id,
      assignedToName: member.name,
      assignedDepartmentId: member.departmentId,
      assignedDepartmentName: member.department.name,
      assignedAt: new Date().toISOString(),
      assignedBy: auth.name || auth.username,
    };

    await prisma.conversation.update({
      where: { id },
      data: {
        status: "escalated",
        assignedToId: member.id,
        metadata: nextMetadata as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    await prisma.ticket.updateMany({
      where: {
        conversationId: id,
        status: { in: ["open", "in_progress"] },
      },
      data: {
        assignedToId: member.id,
        departmentId: member.departmentId,
        status: "in_progress",
      },
    });

    const systemMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: "system",
        content: `Conversation assigned to ${member.name} by ${auth.name || auth.username}`,
        toolCalls: {
          source: "manual_assignment",
          assignedToId: member.id,
          assignedToName: member.name,
          departmentId: member.departmentId,
          departmentName: member.department.name,
          decidedByName: auth.name || auth.username,
        },
      },
    });

    emitNewMessage(id, {
      id: systemMessage.id,
      role: systemMessage.role,
      content: systemMessage.content,
    });
    emitConversationUpdate(id, {
      assignedToId: member.id,
      assignedToName: member.name,
    });

    return NextResponse.json(await getConversation(id));
  } catch (error) {
    logger.error("Failed to assign conversation:", error);
    return NextResponse.json(
      { error: "Failed to assign conversation" },
      { status: 500 }
    );
  }
}
