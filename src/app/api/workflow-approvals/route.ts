import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const [conversations, settings] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          metadata: {
            path: ["pendingWorkflowApproval", "status"],
            equals: "pending",
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
      }),
      prisma.settings.findUnique({
        where: { id: "default" },
        select: { workflowApprovalStaleMinutes: true },
      }),
    ]);

    const staleAfterMinutes = settings?.workflowApprovalStaleMinutes || 30;
    const now = Date.now();

    const items = conversations
      .map((conversation) => {
        const metadata = asMetadata(conversation.metadata);
        const approval = asMetadata(metadata.pendingWorkflowApproval);
        if (!approval.id) return null;
        const requestedAt = String(
          approval.requestedAt || conversation.updatedAt.toISOString()
        );
        const requestedAtMs = new Date(requestedAt).getTime();
        const ageMinutes = Number.isFinite(requestedAtMs)
          ? Math.max(0, Math.floor((now - requestedAtMs) / 60000))
          : 0;

        return {
          id: String(approval.id),
          conversationId: conversation.id,
          customerName: conversation.customerName,
          customerContact: conversation.customerContact,
          channel: conversation.channel,
          conversationStatus: conversation.status,
          messageCount: conversation._count.messages,
          lastMessage: conversation.messages[0] || null,
          flowId: String(approval.flowId || ""),
          flowName: String(approval.flowName || "Workflow"),
          title: String(approval.title || "Approve next workflow step"),
          instructions: String(approval.instructions || ""),
          requestedAt,
          ageMinutes,
          staleAfterMinutes,
          isStale: ageMinutes >= staleAfterMinutes,
          proposedAction: approval.proposedAction || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ items });
  } catch (error) {
    logger.error("Failed to fetch workflow approvals:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow approvals" },
      { status: 500 }
    );
  }
}
