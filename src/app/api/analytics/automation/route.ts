import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

function periodStart(period: string) {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "analytics:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const since = periodStart(request.nextUrl.searchParams.get("period") || "30d");
    const where = { createdAt: { gte: since } };

    const [
      totalRuns,
      completedRuns,
      failedRuns,
      waitingApprovals,
      aiFallbackMessages,
      savedWorkflowReplies,
      approvalSteps,
      actionFailures,
      knowledgeGaps,
    ] = await Promise.all([
      prisma.workflowRun.count({ where }),
      prisma.workflowRun.count({ where: { ...where, status: "completed" } }),
      prisma.workflowRun.count({ where: { ...where, status: "failed" } }),
      prisma.workflowRun.count({ where: { ...where, status: "waiting_approval" } }),
      prisma.message.count({
        where: {
          createdAt: { gte: since },
          role: "assistant",
          toolCalls: {
            path: ["workflowMatch"],
            equals: false,
          },
        },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: since },
          role: "assistant",
          OR: [
            { toolCalls: { path: ["source"], equals: "workflow" } },
            { toolCalls: { path: ["source"], equals: "workflow_approved" } },
            { toolCalls: { path: ["source"], equals: "workflow_ai" } },
            { toolCalls: { path: ["source"], equals: "workflow_ai_kb" } },
            { toolCalls: { path: ["source"], equals: "ticket_automation" } },
          ],
        },
      }),
      prisma.workflowRunStep.findMany({
        where: {
          createdAt: { gte: since },
          OR: [
            { status: "waiting_approval" },
            { actionType: "approval_required" },
          ],
        },
        select: { id: true, status: true, createdAt: true, endedAt: true },
      }),
      prisma.workflowRunStep.findMany({
        where: {
          createdAt: { gte: since },
          status: "failed",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          nodeLabel: true,
          actionType: true,
          message: true,
          createdAt: true,
          run: { select: { flowName: true, conversationId: true } },
        },
      }),
      prisma.message.findMany({
        where: {
          createdAt: { gte: since },
          role: "assistant",
          OR: [
            { toolCalls: { path: ["workflowMatch"], equals: false } },
            { toolCalls: { path: ["reason"], equals: "ai_not_configured" } },
            { toolCalls: { path: ["knowledgeBaseCount"], equals: 0 } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          content: true,
          createdAt: true,
          conversationId: true,
          conversation: {
            select: {
              customerName: true,
              channel: true,
            },
          },
        },
      }),
    ]);

    const resolvedApprovalDurations = approvalSteps
      .filter((step) => step.endedAt)
      .map((step) => step.endedAt!.getTime() - step.createdAt.getTime());
    const avgApprovalMinutes =
      resolvedApprovalDurations.length > 0
        ? Math.round(
            resolvedApprovalDurations.reduce((sum, value) => sum + value, 0) /
              resolvedApprovalDurations.length /
              60000
          )
        : 0;

    return NextResponse.json({
      totalRuns,
      successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
      failedRuns,
      aiFallbackMessages,
      waitingApprovals,
      approvalVolume: approvalSteps.length,
      avgApprovalMinutes,
      savedWorkflowReplies,
      failedActions: actionFailures,
      knowledgeGaps: knowledgeGaps.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        channel: message.conversation.channel,
        customerName: message.conversation.customerName,
        preview: message.content.slice(0, 180),
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch automation analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch automation analytics" },
      { status: 500 }
    );
  }
}
