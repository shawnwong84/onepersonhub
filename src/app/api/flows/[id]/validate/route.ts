import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { validateFlow, type CanvasFlow } from "@/lib/flow-builder";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "automation:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;

    const flow = await prisma.flow.findUnique({ where: { id } });
    if (!flow) {
      return NextResponse.json(
        { error: "Flow not found" },
        { status: 404 }
      );
    }

    const canvasFlow: CanvasFlow = {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      startNodeId: flow.startNodeId,
      nodes: (flow.nodes as unknown as CanvasFlow["nodes"]) || [],
      edges: (flow.edges as unknown as CanvasFlow["edges"]) || [],
      isActive: flow.isActive,
    };

    const result = validateFlow(canvasFlow);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to validate flow:", error);
    return NextResponse.json(
      { error: "Failed to validate flow" },
      { status: 500 }
    );
  }
}
