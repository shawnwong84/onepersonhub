import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

// GET /api/agents/analytics?days=30 - per-agent operational metrics
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "agents:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const agents = await prisma.agent.findMany({
      select: { id: true, name: true, status: true, workflows: { select: { flowId: true } } },
      orderBy: { name: "asc" },
    });

    const analytics = await Promise.all(
      agents.map(async (agent) => {
        const flowIds = agent.workflows.map((w) => w.flowId);
        const [conversations, takeovers, aiReplies, workflowReplies, runsTotal, runsCompleted] =
          await Promise.all([
            prisma.conversation.count({ where: { agentId: agent.id, createdAt: { gte: since } } }),
            prisma.conversation.count({
              where: {
                agentId: agent.id,
                createdAt: { gte: since },
                metadata: { path: ["humanTakeover"], equals: true },
              },
            }),
            prisma.message.count({
              where: {
                createdAt: { gte: since },
                role: "assistant",
                AND: [
                  { toolCalls: { path: ["source"], equals: "ai" } },
                  { toolCalls: { path: ["agentId"], equals: agent.id } },
                ],
              },
            }),
            prisma.message.count({
              where: {
                createdAt: { gte: since },
                role: "assistant",
                AND: [
                  { toolCalls: { path: ["source"], equals: "workflow" } },
                  { toolCalls: { path: ["agentId"], equals: agent.id } },
                ],
              },
            }),
            flowIds.length
              ? prisma.workflowRun.count({
                  where: { flowId: { in: flowIds }, createdAt: { gte: since }, status: { notIn: ["started"] } },
                })
              : 0,
            flowIds.length
              ? prisma.workflowRun.count({
                  where: { flowId: { in: flowIds }, createdAt: { gte: since }, status: "completed" },
                })
              : 0,
          ]);

        const automatedReplies = aiReplies + workflowReplies;
        return {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          conversations,
          aiReplies,
          workflowReplies,
          // Share of automated replies that fell back to plain AI instead of a workflow.
          aiFallbackRate: automatedReplies > 0 ? Math.round((aiReplies / automatedReplies) * 100) : 0,
          workflowSuccessRate: runsTotal > 0 ? Math.round((runsCompleted / runsTotal) * 100) : 0,
          workflowRuns: runsTotal,
          // Share of the agent's conversations a human had to take over.
          handoffRate: conversations > 0 ? Math.round((takeovers / conversations) * 100) : 0,
          handoffs: takeovers,
        };
      })
    );

    return NextResponse.json({ days, agents: analytics });
  } catch (error) {
    logger.error("Failed to compute agent analytics:", error);
    return NextResponse.json({ error: "Failed to compute agent analytics" }, { status: 500 });
  }
}
