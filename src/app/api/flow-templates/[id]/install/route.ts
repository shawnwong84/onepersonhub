import { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { getWorkflowTemplate } from "@/lib/workflow-templates";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "automation:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const template = getWorkflowTemplate(id);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const flow = await prisma.flow.create({
      data: {
        name: template.name,
        description: template.description,
        startNodeId: template.nodes[0]?.id || "",
        nodes: template.nodes as unknown as Prisma.InputJsonValue,
        edges: template.edges as unknown as Prisma.InputJsonValue,
        isActive: false,
      },
    });

    return NextResponse.json(flow, { status: 201 });
  } catch (error) {
    logger.error("Failed to install flow template:", error);
    return NextResponse.json(
      { error: "Failed to install flow template" },
      { status: 500 }
    );
  }
}
