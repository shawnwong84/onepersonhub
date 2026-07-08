import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

export const ACTIVITY_ENTITIES = {
  CONVERSATION: "conversation",
  MESSAGE: "message",
  TICKET: "ticket",
  WORKFLOW: "workflow",
  APPROVAL: "approval",
  CHANNEL: "channel",
  KNOWLEDGE: "knowledge",
  AGENT: "agent",
  SETTINGS: "settings",
  MARKETPLACE: "marketplace",
  MODULE: "module",
  MODULE_RECORD: "module_record",
  SYSTEM: "system",
} as const;

export const ACTIVITY_ACTIONS = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  RECEIVED: "received",
  SENT: "sent",
  FAILED: "failed",
  MATCHED: "matched",
  SKIPPED: "skipped",
  COMPLETED: "completed",
  APPROVAL_REQUESTED: "approval_requested",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export interface ActivityPayload {
  action: string;
  entity: string;
  entityId?: string | null;
  description: string;
  userId?: string | null;
  userName?: string | null;
  metadata?: Prisma.InputJsonValue;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function getActivityRequestContext(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return {
    requestId:
      request.headers.get("x-request-id") ||
      request.headers.get("x-correlation-id") ||
      null,
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

function normalizeActivityPayload(
  payloadOrAction: ActivityPayload | string,
  entity?: string,
  entityId?: string | null,
  description?: string,
  userName?: string
): ActivityPayload {
  if (typeof payloadOrAction === "object") {
    return payloadOrAction;
  }

  return {
    action: payloadOrAction,
    entity: entity || ACTIVITY_ENTITIES.SYSTEM,
    entityId,
    description: description || payloadOrAction,
    userName,
  };
}

export async function logActivity(
  payloadOrAction: ActivityPayload | string,
  entity?: string,
  entityId?: string | null,
  description?: string,
  userName?: string
): Promise<void> {
  const payload = normalizeActivityPayload(
    payloadOrAction,
    entity,
    entityId,
    description,
    userName
  );

  try {
    await prisma.activityLog.create({
      data: {
        action: payload.action,
        entity: payload.entity,
        entityId: payload.entityId || null,
        description: payload.description,
        userId: payload.userId || null,
        userName: payload.userName || "System",
        metadata: payload.metadata,
        requestId: payload.requestId || null,
        ipAddress: payload.ipAddress || null,
        userAgent: payload.userAgent || null,
      },
    });
  } catch (error) {
    logger.error("Failed to log activity", error);
  }
}
