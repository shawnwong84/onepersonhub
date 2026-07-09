import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { runChannelWorkflows } from "@/lib/workflow-runtime";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

// POST /api/webhooks/inbound - external systems trigger workflows here.
// Authenticate with an API key (X-API-Key header).
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerContact = typeof body.customerContact === "string" ? body.customerContact.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 10000) {
      return NextResponse.json({ error: "message is too long (max 10000 characters)" }, { status: 400 });
    }

    let conversation = conversationId
      ? await prisma.conversation.findUnique({ where: { id: conversationId } })
      : null;
    if (conversationId && !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          channel: "webhook",
          customerName: customerName || "Webhook",
          customerContact: customerContact || "webhook",
          status: "active",
          metadata: { source: "inbound_webhook", createdBy: auth.name || auth.username },
        },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "customer",
        content: message,
        toolCalls: { source: "inbound_webhook" },
      },
    });

    const result = await runChannelWorkflows({
      channel: "webhook",
      triggerEvent: "webhook_received",
      conversationId: conversation.id,
      customerId: conversation.customerId,
      agentId: conversation.agentId,
      channelAccountId: conversation.channelAccountId,
      message,
      saveInputMessage: false,
    });

    await logActivity({
      action: "webhook.inbound_received",
      entity: ACTIVITY_ENTITIES.WORKFLOW,
      entityId: conversation.id,
      description: `Inbound webhook message ${result.handled ? "handled by workflow" : "received"} (${result.flowName || "no matching workflow"}).`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        conversationId: conversation.id,
        handled: result.handled,
        flowId: result.flowId || null,
        flowName: result.flowName || null,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({
      conversationId: conversation.id,
      handled: result.handled,
      flowName: result.flowName || null,
      replies: result.replies,
    });
  } catch (error) {
    logger.error("Inbound webhook failed:", error);
    return NextResponse.json({ error: "Inbound webhook failed" }, { status: 500 });
  }
}
