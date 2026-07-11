import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { emitNewMessage } from "@/lib/realtime";
import { sendWhatsAppMessage } from "@/lib/channels/whatsapp";
import { sendWhatsAppAccountMessage } from "@/lib/channels/whatsapp-accounts";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { recentMessagesQuery, toAscending } from "@/lib/message-history";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "messages:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      ...recentMessagesQuery,
    });

    return NextResponse.json(toAscending(messages));
  } catch (error) {
    logger.error("Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "messages:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { content, role } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const validRoles = ["customer", "assistant", "admin", "system"];
    const messageRole = validRoles.includes(role) ? role : "assistant";
    let deliveryStatus = "not_applicable";

    if (messageRole === "admin" && conversation.channel === "whatsapp") {
      deliveryStatus = "pending";
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        role: messageRole,
        content: content.trim(),
        ...(messageRole === "admin" && {
          toolCalls: {
            source: "admin",
            deliveryStatus,
          },
        }),
      },
    });

    if (messageRole === "admin" && conversation.channel === "whatsapp") {
      try {
        // Route through the conversation's channel account when it has a
        // connected client; fall back to the default WhatsApp client.
        let delivered = false;
        if (conversation.channelAccountId) {
          delivered = await sendWhatsAppAccountMessage(
            conversation.channelAccountId,
            conversation.customerContact,
            content.trim()
          );
        }
        if (!delivered) {
          delivered = await sendWhatsAppMessage(
            conversation.customerContact,
            content.trim()
          );
        }
        deliveryStatus = delivered ? "sent" : "failed";
      } catch (error) {
        logger.error("Failed to send WhatsApp manual reply:", error);
        deliveryStatus = "failed";
      }

      await prisma.message.update({
        where: { id: message.id },
        data: {
          toolCalls: {
            source: "admin",
            deliveryStatus,
          },
        },
      });
    }

    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    await logActivity({
      action: messageRole === "admin" ? "message.manual_reply_sent" : "message.created",
      entity: ACTIVITY_ENTITIES.MESSAGE,
      entityId: message.id,
      description:
        messageRole === "admin"
          ? `Manual reply sent to ${conversation.customerName || conversation.customerContact}.`
          : `Created ${messageRole} message in conversation.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        conversationId: id,
        channel: conversation.channel,
        role: messageRole,
        deliveryStatus,
      },
      ...getActivityRequestContext(request),
    });

    emitNewMessage(id, { id: message.id, role: messageRole, content: content.trim() });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    logger.error("Failed to create message:", error);
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    );
  }
}
