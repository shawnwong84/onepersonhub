import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "automation:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const flowId = searchParams.get("flowId");
    const conversationId = searchParams.get("conversationId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (flowId) where.flowId = flowId;
    if (conversationId) where.conversationId = conversationId;
    if (status && status !== "all") where.status = status;

    const [runs, total] = await Promise.all([
      prisma.workflowRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          steps: { orderBy: { createdAt: "asc" } },
          flow: { select: { id: true, name: true, isActive: true } },
          conversation: {
            select: {
              id: true,
              channel: true,
              customerName: true,
              customerContact: true,
              status: true,
            },
          },
        },
      }),
      prisma.workflowRun.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(runs, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch workflow runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow runs" },
      { status: 500 }
    );
  }
}
