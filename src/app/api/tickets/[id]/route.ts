import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isUnscoped } from "@/lib/rbac-scope";
import { sendTicketCloseReply } from "@/lib/ticket-automation";
import { runChannelWorkflows } from "@/lib/workflow-runtime";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        conversation: {
          select: {
            id: true,
            customerName: true,
            customerContact: true,
            channel: true,
            status: true,
          },
        },
        department: {
          select: { id: true, name: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    if (!(await isUnscoped(auth)) && ticket.assignedToId !== auth.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This ticket is not assigned to you." } },
        { status: 403 }
      );
    }

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error("Failed to fetch ticket:", error);
    return NextResponse.json(
      { error: "Failed to fetch ticket" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      description,
      status,
      priority,
      resolution,
      departmentId,
      assignedToId,
      conversationId,
    } = body;

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    if (!(await isUnscoped(auth)) && existing.assignedToId !== auth.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This ticket is not assigned to you." } },
        { status: 403 }
      );
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(resolution !== undefined && { resolution: resolution.trim() }),
        ...(departmentId !== undefined && {
          departmentId: departmentId || null,
        }),
        ...(assignedToId !== undefined && {
          assignedToId: assignedToId || null,
        }),
        ...(conversationId !== undefined && {
          conversationId: conversationId || null,
        }),
      },
      include: {
        conversation: {
          select: {
            id: true,
            customerId: true,
            customerName: true,
            customerContact: true,
            channel: true,
            status: true,
          },
        },
        department: {
          select: { id: true, name: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    if (title !== undefined && title.trim() !== existing.title) {
      changes.title = { from: existing.title, to: title.trim() };
    }
    if (status !== undefined && status !== existing.status) {
      changes.status = { from: existing.status, to: status };
    }
    if (priority !== undefined && priority !== existing.priority) {
      changes.priority = { from: existing.priority, to: priority };
    }
    if (departmentId !== undefined && (departmentId || null) !== existing.departmentId) {
      changes.departmentId = { from: existing.departmentId, to: departmentId || null };
    }
    if (assignedToId !== undefined && (assignedToId || null) !== existing.assignedToId) {
      changes.assignedToId = { from: existing.assignedToId, to: assignedToId || null };
    }
    if (conversationId !== undefined && (conversationId || null) !== existing.conversationId) {
      changes.conversationId = { from: existing.conversationId, to: conversationId || null };
    }

    const ticketAction = changes.status
      ? ["closed", "resolved"].includes(String(changes.status.to))
        ? "ticket.closed"
        : "ticket.status_changed"
      : changes.assignedToId
        ? "ticket.assigned"
        : changes.priority
          ? "ticket.priority_changed"
          : "ticket.updated";

    await logActivity({
      action: ticketAction,
      entity: ACTIVITY_ENTITIES.TICKET,
      entityId: ticket.id,
      description:
        changes.status
          ? `Ticket "${ticket.title}" status changed from ${changes.status.from} to ${changes.status.to}.`
          : changes.assignedToId
            ? `Ticket "${ticket.title}" assigned.`
            : changes.priority
              ? `Ticket "${ticket.title}" priority changed from ${changes.priority.from} to ${changes.priority.to}.`
              : Object.keys(changes).length > 0
                ? `Updated ticket: ${ticket.title}.`
                : `Saved ticket: ${ticket.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        changes,
        status: ticket.status,
        priority: ticket.priority,
        conversationId: ticket.conversationId,
      },
      ...getActivityRequestContext(request),
    });

    const movedToClosedState =
      status !== undefined &&
      ["closed", "resolved"].includes(status) &&
      existing.status !== status;

    const statusChanged =
      status !== undefined && status !== existing.status && ticket.conversation;

    if (statusChanged && ticket.conversation) {
      const eventMessage = [
        `Ticket "${ticket.title}" status changed from ${existing.status} to ${ticket.status}.`,
        ticket.resolution ? `Resolution: ${ticket.resolution}` : "",
      ].filter(Boolean).join("\n");

      await runChannelWorkflows({
        channel: "ticket",
        triggerEvent: "ticket_status_changed",
        conversationId: ticket.conversation.id,
        customerId: ticket.conversation.customerId,
        message: eventMessage,
        saveInputMessage: false,
      });
    }

    if (movedToClosedState) {
      await sendTicketCloseReply({
        ticketId: ticket.id,
        actorName: auth.name || auth.username,
      });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error("Failed to update ticket:", error);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "tickets:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    await prisma.ticket.delete({ where: { id } });

    await logActivity({
      action: "ticket.deleted",
      entity: ACTIVITY_ENTITIES.TICKET,
      entityId: existing.id,
      description: `Deleted ticket: ${existing.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        status: existing.status,
        priority: existing.priority,
        conversationId: existing.conversationId,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete ticket:", error);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    );
  }
}
