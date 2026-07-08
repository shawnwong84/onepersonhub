import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { emitNotification } from "@/lib/realtime";
import { logger } from "@/lib/logger";

interface CreateNotificationInput {
  type: string;
  title: string;
  message: string;
  priority?: "normal" | "high" | "urgent";
  href?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  try {
    const notification = await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        priority: input.priority || "normal",
        href: input.href || "",
        conversationId: input.conversationId,
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });

    emitNotification({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      href: notification.href,
      conversationId: notification.conversationId,
      createdAt: notification.createdAt.toISOString(),
    });

    return notification;
  } catch (error) {
    logger.error("Failed to create notification:", error);
    return null;
  }
}
