import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { createNotification } from "@/lib/notifications";
import { emitConversationUpdate, emitNewMessage } from "@/lib/realtime";
import { logger } from "@/lib/logger";
import {
  finishWorkflowRun,
  recordWorkflowRunStep,
  startWorkflowRun,
} from "@/lib/workflow-run-logger";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

interface TicketCloseReplyInput {
  ticketId: string;
  actorName: string;
}

const DEFAULT_TICKET_CLOSE_REPLY_TEMPLATE =
  'Your ticket "{{ticketTitle}}" has been {{ticketStatus}}.\n\n{{resolution}}\n\nIf you need more help, reply here and our support team will follow up.';

function normalizeTemplateOutput(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function renderTemplate(
  template: string,
  variables: Record<string, string>
) {
  const source = template.trim() || DEFAULT_TICKET_CLOSE_REPLY_TEMPLATE;
  const rendered = source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });

  return normalizeTemplateOutput(rendered);
}

function buildCloseReply(ticket: {
  title: string;
  status: string;
  resolution: string;
  conversation: {
    customerName: string;
  } | null;
}, template: string, actorName: string) {
  const content = renderTemplate(template, {
    ticketTitle: ticket.title,
    ticketStatus: ticket.status,
    resolution: ticket.resolution.trim(),
    agentName: actorName,
    customerName: ticket.conversation?.customerName || "customer",
  });

  if (content) {
    return content;
  }

  return renderTemplate(DEFAULT_TICKET_CLOSE_REPLY_TEMPLATE, {
    ticketTitle: ticket.title,
    ticketStatus: ticket.status,
    resolution: ticket.resolution.trim(),
    agentName: actorName,
    customerName: ticket.conversation?.customerName || "customer",
  });
}

export async function sendTicketCloseReply(input: TicketCloseReplyInput) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    include: {
      conversation: {
        select: {
          id: true,
          channel: true,
          customerName: true,
          customerContact: true,
          metadata: true,
        },
      },
    },
  });

  if (!ticket?.conversation) return null;

  if (!["closed", "resolved"].includes(ticket.status)) return null;

  const run = await startWorkflowRun({
    flowName: "Ticket close auto-reply",
    conversationId: ticket.conversation.id,
    triggerEvent: `ticket_${ticket.status}`,
    channel: ticket.conversation.channel,
    message: ticket.title,
    metadata: {
      source: "ticket_automation",
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      ticketStatus: ticket.status,
    },
  });

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: {
      ticketCloseAutoReplyEnabled: true,
      ticketCloseRequireApproval: true,
      ticketCloseReplyTemplate: true,
    },
  });

  if (settings?.ticketCloseAutoReplyEnabled === false) {
    await recordWorkflowRunStep(run?.id, {
      nodeLabel: "Ticket close auto-reply",
      nodeType: "ticket_automation",
      actionType: "settings_check",
      status: "skipped",
      message: "Ticket close auto-reply is disabled in settings.",
      metadata: { ticketId: ticket.id },
    });
    await finishWorkflowRun(
      run?.id,
      "skipped",
      "Ticket close auto-reply disabled"
    );
    return null;
  }

  const existing = await prisma.message.findFirst({
    where: {
      conversationId: ticket.conversation.id,
      role: "assistant",
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (
    existing?.toolCalls &&
    typeof existing.toolCalls === "object" &&
    !Array.isArray(existing.toolCalls)
  ) {
    const toolCalls = existing.toolCalls as Record<string, unknown>;
    if (
      toolCalls.source === "ticket_automation" &&
      toolCalls.ticketId === ticket.id &&
      toolCalls.ticketStatus === ticket.status
    ) {
      await recordWorkflowRunStep(run?.id, {
        nodeLabel: "Duplicate guard",
        nodeType: "ticket_automation",
        actionType: "dedupe",
        status: "skipped",
        message: "A close reply was already sent for this ticket status.",
        metadata: { ticketId: ticket.id, existingMessageId: existing.id },
      });
      await finishWorkflowRun(run?.id, "skipped", "Duplicate close reply");
      return existing;
    }
  }

  const template =
    settings?.ticketCloseReplyTemplate || DEFAULT_TICKET_CLOSE_REPLY_TEMPLATE;
  const content = buildCloseReply(ticket, template, input.actorName);

  if (settings?.ticketCloseRequireApproval) {
    const metadata = asMetadata(ticket.conversation.metadata);
    const approvalId = `ticket-close-${ticket.id}-${Date.now()}`;
    const pendingApproval = {
      id: approvalId,
      status: "pending",
      source: "ticket_automation",
      flowId: "ticket_automation",
      flowName: "Ticket close auto-reply",
      approvalNodeId: "ticket-close-approval",
      nextNodeId: "ticket-close-reply",
      runId: run?.id || null,
      title: "Approve ticket close reply",
      instructions:
        "Review the proposed customer update before it is sent on the original channel.",
      proposedAction: {
        type: "reply_customer",
        label: "Ticket close reply",
        payload: content,
      },
      requestedAt: new Date().toISOString(),
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      ticketStatus: ticket.status,
      actorName: input.actorName,
    };

    await prisma.conversation.update({
      where: { id: ticket.conversation.id },
      data: {
        metadata: {
          ...metadata,
          pendingWorkflowApproval: pendingApproval,
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    await recordWorkflowRunStep(run?.id, {
      nodeId: "ticket-close-approval",
      nodeLabel: "Approve ticket close reply",
      nodeType: "approval",
      actionType: "approval_required",
      status: "waiting_approval",
      message: "Ticket close reply is waiting for customer service approval.",
      metadata: {
        approvalId,
        ticketId: ticket.id,
        proposedReply: content,
      },
    });
    await finishWorkflowRun(
      run?.id,
      "waiting_approval",
      "Ticket close reply waiting for approval",
      {
        approvalId,
        ticketId: ticket.id,
      }
    );

    await createNotification({
      type: "workflow_approval_required",
      title: "Ticket close reply needs approval",
      message: `${ticket.title}: review the customer reply before sending.`,
      priority: "high",
      href: `/conversations?conversationId=${ticket.conversation.id}`,
      conversationId: ticket.conversation.id,
      metadata: {
        approvalId,
        source: "ticket_automation",
        ticketId: ticket.id,
        ticketStatus: ticket.status,
      },
    });

    emitConversationUpdate(ticket.conversation.id, {
      pendingWorkflowApproval: pendingApproval,
    });

    return null;
  }
  let deliveryStatus: "not_applicable" | "sent" | "skipped" | "failed" =
    "not_applicable";
  let deliveryError: string | null = null;

  if (ticket.conversation.channel === "whatsapp") {
    try {
      const sent = await sendWhatsAppMessage(ticket.conversation.customerContact, content);
      deliveryStatus = sent ? "sent" : "skipped";
    } catch (error) {
      deliveryStatus = "failed";
      deliveryError = error instanceof Error ? error.message : String(error);
      logger.error("Ticket close auto-reply failed to send:", {
        ticketId: ticket.id,
        conversationId: ticket.conversation.id,
        error,
      });
    }
  }

  const saved = await prisma.message.create({
    data: {
      conversationId: ticket.conversation.id,
      role: "assistant",
      content,
      toolCalls: {
        source: "ticket_automation",
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        ticketStatus: ticket.status,
        actorName: input.actorName,
        templateUsed: template,
        deliveryStatus,
        deliveryError,
      },
    },
  });

  await prisma.conversation.update({
    where: { id: ticket.conversation.id },
    data: { updatedAt: new Date() },
  });

  emitNewMessage(ticket.conversation.id, {
    id: saved.id,
    role: saved.role,
    content: saved.content,
    source: "ticket_automation",
    createdAt: saved.createdAt.toISOString(),
  });
  emitConversationUpdate(ticket.conversation.id, {
    lastTicketAutomation: ticket.id,
  });

  if (deliveryStatus === "failed") {
    await createNotification({
      type: "ticket_auto_reply_failed",
      title: "Ticket close reply failed",
      message: `${ticket.title}: ${deliveryError || "Delivery failed"}`,
      priority: "high",
      href: `/conversations?conversationId=${ticket.conversation.id}`,
      conversationId: ticket.conversation.id,
      metadata: {
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        deliveryError,
      },
    });
  }

  await logActivity({
    action:
      deliveryStatus === "failed"
        ? "ticket.close_auto_reply_failed"
        : "ticket.close_auto_reply_sent",
    entity: ACTIVITY_ENTITIES.TICKET,
    entityId: ticket.id,
    description:
      deliveryStatus === "failed"
        ? `Ticket close auto-reply failed for ${ticket.title}.`
        : `Ticket close auto-reply recorded for ${ticket.title}.`,
    userName: input.actorName,
    metadata: {
      conversationId: ticket.conversation.id,
      channel: ticket.conversation.channel,
      messageId: saved.id,
      deliveryStatus,
      deliveryError,
      ticketStatus: ticket.status,
    },
  });

  await recordWorkflowRunStep(run?.id, {
    nodeLabel: "Send close reply",
    nodeType: "ticket_automation",
    actionType: "reply_customer",
    status: deliveryStatus === "failed" ? "failed" : "completed",
    message:
      deliveryStatus === "failed"
        ? deliveryError || "Delivery failed"
        : "Ticket close reply saved to the conversation.",
    metadata: {
      ticketId: ticket.id,
      messageId: saved.id,
      deliveryStatus,
      deliveryError,
    },
  });
  await finishWorkflowRun(
    run?.id,
    deliveryStatus === "failed" ? "failed" : "completed",
    deliveryStatus === "failed"
      ? deliveryError || "Ticket close reply delivery failed"
      : "Ticket close reply completed",
    {
      ticketId: ticket.id,
      messageId: saved.id,
      deliveryStatus,
      deliveryError,
    }
  );

  return saved;
}
