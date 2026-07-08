import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { emitConversationUpdate, emitNewMessage } from "@/lib/realtime";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import {
  finishWorkflowRun,
  recordWorkflowRunStep,
} from "@/lib/workflow-run-logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

interface PendingWorkflowApproval {
  id: string;
  status: string;
  source?: string;
  flowId: string;
  flowName: string;
  approvalNodeId: string;
  nextNodeId?: string | null;
  runId?: string | null;
  title: string;
  instructions?: string;
  proposedAction?: {
    type?: string;
    label?: string;
    payload?: string;
  } | null;
  ticketId?: string;
  ticketTitle?: string;
  ticketStatus?: string;
  actorName?: string;
  requestedAt: string;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getPendingApproval(metadata: Record<string, unknown>) {
  const approval = metadata.pendingWorkflowApproval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    return null;
  }
  return approval as unknown as PendingWorkflowApproval;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const decision = String(body.decision || "");
    const editedPayload =
      typeof body.payload === "string" ? body.payload.trim() : undefined;
    const decisionComment =
      typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";

    if (!["approve", "skip", "reject"].includes(decision)) {
      return NextResponse.json(
        { error: "Decision must be approve, skip, or reject" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        channel: true,
        customerContact: true,
        metadata: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const metadata = asMetadata(conversation.metadata);
    const approval = getPendingApproval(metadata);

    if (!approval) {
      return NextResponse.json(
        { error: "No pending workflow approval" },
        { status: 404 }
      );
    }

    const existingDecision = await prisma.message.findFirst({
      where: {
        conversationId: id,
        role: "system",
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const existingDecisionMetadata = existingDecision
      ? asMetadata(existingDecision.toolCalls)
      : {};

    if (
      existingDecisionMetadata.source === "workflow_approval_decision" &&
      existingDecisionMetadata.approvalId === approval.id
    ) {
      const nextMetadata = {
        ...metadata,
        pendingWorkflowApproval: null,
        lastWorkflowApproval: {
          ...approval,
          status: existingDecisionMetadata.decision || "resolved",
          decidedAt: existingDecision!.createdAt.toISOString(),
          decidedByName: existingDecisionMetadata.decidedByName || "Unknown",
          decisionComment: existingDecisionMetadata.decisionComment || null,
        },
      };

      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          metadata: nextMetadata as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
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

      await prisma.notification.updateMany({
        where: {
          conversationId: id,
          type: "workflow_approval_required",
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      emitConversationUpdate(id, { pendingWorkflowApproval: null });
      return NextResponse.json(updated);
    }

    const now = new Date().toISOString();
    const resolvedApproval = {
      ...approval,
      status: decision,
      decidedAt: now,
      decidedById: auth.userId,
      decidedByName: auth.name || auth.username,
      editedPayload: editedPayload || null,
      decisionComment: decisionComment || null,
    };

    const nextMetadata = {
      ...metadata,
      pendingWorkflowApproval: null,
      lastWorkflowApproval: resolvedApproval,
    };
    let deliveryStatus: "not_applicable" | "sent" | "skipped" | "failed" =
      "not_applicable";
    let deliveryError: string | null = null;

    const claimedApproval = await prisma.conversation.updateMany({
      where: {
        id,
        metadata: {
          path: ["pendingWorkflowApproval", "id"],
          equals: approval.id,
        },
      },
      data: {
        metadata: nextMetadata as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    if (claimedApproval.count === 0) {
      const updated = await prisma.conversation.findUnique({
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

      await prisma.notification.updateMany({
        where: {
          conversationId: id,
          type: "workflow_approval_required",
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      emitConversationUpdate(id, { pendingWorkflowApproval: null });
      return NextResponse.json(updated);
    }

    await recordWorkflowRunStep(approval.runId, {
      nodeId: approval.approvalNodeId,
      nodeLabel: approval.title,
      nodeType: "approval",
      actionType: "approval_required",
      status: decision === "approve" ? "completed" : "skipped",
      message: `Workflow approval ${decision}`,
      metadata: {
        approvalId: approval.id,
        decision,
        decidedById: auth.userId,
        decidedByName: auth.name || auth.username,
        editedPayload: editedPayload || null,
        decisionComment: decisionComment || null,
      },
    });

    if (decision === "approve") {
      const proposedAction = approval.proposedAction;
      const payload = editedPayload || proposedAction?.payload || "";

      if (proposedAction?.type === "reply_customer" && payload) {
        const recentMessages = await prisma.message.findMany({
          where: {
            conversationId: id,
            role: "assistant",
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        });
        const existingApprovedMessage = recentMessages.find((message) => {
          const toolCalls = asMetadata(message.toolCalls);
          return (
            toolCalls.source === "workflow_approved" &&
            toolCalls.approvalId === approval.id
          );
        });

        if (conversation.channel === "whatsapp") {
          try {
            const sent = await sendWhatsAppMessage(conversation.customerContact, payload);
            deliveryStatus = sent ? "sent" : "skipped";
          } catch (error) {
            deliveryStatus = "failed";
            deliveryError = error instanceof Error ? error.message : String(error);
            logger.error("Approved workflow reply failed to send to WhatsApp:", {
              conversationId: id,
              customerContact: conversation.customerContact,
              error,
            });
          }
        }

        if (conversation.channel === "whatsapp" && deliveryStatus !== "sent") {
          await createNotification({
            type: "workflow_reply_delivery_failed",
            title: "Workflow reply was not sent",
            message:
              deliveryStatus === "failed"
                ? `Approved reply failed to send to WhatsApp: ${deliveryError || "Unknown error"}`
                : "Approved reply was skipped because WhatsApp is not connected.",
            priority: "high",
            href: `/conversations?conversationId=${id}`,
            conversationId: id,
            metadata: {
              approvalId: approval.id,
              flowId: approval.flowId,
              flowName: approval.flowName,
              deliveryStatus,
              deliveryError,
            },
          });
        } else if (existingApprovedMessage) {
          const toolCalls = {
            ...asMetadata(existingApprovedMessage.toolCalls),
            deliveryStatus,
            deliveryError,
          };
          await prisma.message.update({
            where: { id: existingApprovedMessage.id },
            data: {
              content: payload,
              toolCalls: toolCalls as Prisma.InputJsonValue,
            },
          });
        } else {
          const isTicketAutomation = approval.source === "ticket_automation";
          const saved = await prisma.message.create({
            data: {
              conversationId: id,
              role: "assistant",
              content: payload,
              toolCalls: isTicketAutomation
                ? {
                    source: "ticket_automation",
                    ticketId: approval.ticketId,
                    ticketTitle: approval.ticketTitle,
                    ticketStatus: approval.ticketStatus,
                    actorName: approval.actorName,
                    approvalId: approval.id,
                    approvedByName: auth.name || auth.username,
                    deliveryStatus,
                    deliveryError,
                  }
                : {
                    source: "workflow_approved",
                    flowId: approval.flowId,
                    flowName: approval.flowName,
                    approvalId: approval.id,
                    approvedByName: auth.name || auth.username,
                    deliveryStatus,
                    deliveryError,
                  },
            },
          });

          emitNewMessage(id, {
            id: saved.id,
            role: saved.role,
            content: saved.content,
            source: isTicketAutomation ? "ticket_automation" : "workflow_approved",
            createdAt: saved.createdAt.toISOString(),
          });
        }
      }
    }

    const systemMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: "system",
        content: decisionComment
          ? `Workflow approval ${decision}: ${approval.title} - ${decisionComment}`
          : `Workflow approval ${decision}: ${approval.title}`,
        toolCalls: {
          source: "workflow_approval_decision",
          decision,
          flowId: approval.flowId,
          flowName: approval.flowName,
          approvalSource: approval.source || "workflow",
          ticketId: approval.ticketId,
          ticketTitle: approval.ticketTitle,
          ticketStatus: approval.ticketStatus,
          approvalId: approval.id,
          decidedByName: auth.name || auth.username,
          decisionComment: decisionComment || null,
          deliveryStatus,
          deliveryError,
        },
      },
    });

    await prisma.notification.updateMany({
      where: {
        conversationId: id,
        type: "workflow_approval_required",
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    await finishWorkflowRun(
      approval.runId,
      decision === "approve" ? "completed" : "skipped",
      `Workflow approval ${decision}`,
      {
        approvalId: approval.id,
        decision,
        decisionComment: decisionComment || null,
        deliveryStatus,
        deliveryError,
      }
    );

    const decisionLabel =
      decision === "approve" ? "approved" : decision === "skip" ? "skipped" : "rejected";

    await logActivity({
      action: `workflow_approval.${decision}`,
      entity: ACTIVITY_ENTITIES.APPROVAL,
      entityId: approval.id,
      description: `${auth.name || auth.username} ${decisionLabel} workflow approval: ${approval.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        conversationId: id,
        flowId: approval.flowId,
        flowName: approval.flowName,
        approvalId: approval.id,
        decision,
        decisionComment: decisionComment || null,
        deliveryStatus,
        deliveryError,
      },
      ...getActivityRequestContext(request),
    });

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        updatedAt: new Date(),
      },
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

    emitNewMessage(id, {
      id: systemMessage.id,
      role: systemMessage.role,
      content: systemMessage.content,
    });
    emitConversationUpdate(id, { pendingWorkflowApproval: null });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Failed to resolve workflow approval:", error);
    return NextResponse.json(
      { error: "Failed to resolve workflow approval" },
      { status: 500 }
    );
  }
}
