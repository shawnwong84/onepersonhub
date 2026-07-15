import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "automation:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const isActive = searchParams.get("isActive");

    const where: Record<string, unknown> = {};

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const [flows, total] = await Promise.all([
      prisma.flow.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.flow.count({ where }),
    ]);

    const flowIds = flows.map((flow) => flow.id);
    let latestRunsByFlow = new Map<
      string,
      {
        id: string;
        status: string;
        reason: string;
        createdAt: Date;
        completedAt: Date | null;
      }[]
    >();

    if (flowIds.length > 0) {
      try {
        const latestRuns = await prisma.workflowRun.findMany({
          where: { flowId: { in: flowIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            flowId: true,
            status: true,
            reason: true,
            createdAt: true,
            completedAt: true,
          },
        });

        latestRunsByFlow = latestRuns.reduce((map, run) => {
          if (run.flowId && !map.has(run.flowId)) {
            map.set(run.flowId, [
              {
                id: run.id,
                status: run.status,
                reason: run.reason,
                createdAt: run.createdAt,
                completedAt: run.completedAt,
              },
            ]);
          }
          return map;
        }, latestRunsByFlow);
      } catch (runError) {
        logger.error("Failed to attach latest flow runs:", runError);
      }
    }

    const flowsWithRuns = flows.map((flow) => ({
      ...flow,
      runs: latestRunsByFlow.get(flow.id) || [],
    }));

    return NextResponse.json(paginatedResponse(flowsWithRuns, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch flows:", error);
    return NextResponse.json(
      { error: "Failed to fetch flows" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "automation:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { name, description, startNodeId, nodes, edges, isActive } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // New flows evaluate last by default (append to the end of the priority
    // order) rather than defaulting to 0, so they don't silently jump ahead
    // of existing flows that already match the same trigger.
    const lowestPriorityFlow = await prisma.flow.findFirst({
      orderBy: { priority: "desc" },
      select: { priority: true },
    });
    const nextPriority = (lowestPriorityFlow?.priority ?? -1) + 1;

    const flow = await prisma.flow.create({
      data: {
        companyId: auth.companyId,
        name: name.trim(),
        description: description?.trim() || "",
        startNodeId: startNodeId || "",
        nodes: nodes || [],
        edges: edges || [],
        isActive: isActive ?? false,
        priority: nextPriority,
      },
    });

    return NextResponse.json(flow, { status: 201 });
  } catch (error) {
    logger.error("Failed to create flow:", error);
    return NextResponse.json(
      { error: "Failed to create flow" },
      { status: 500 }
    );
  }
}
